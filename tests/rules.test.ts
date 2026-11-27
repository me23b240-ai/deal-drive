import { describe, expect, it } from "vitest";
import { buildDecisions, type DecisionSnapshot } from "@/lib/domain/decisions";
import { evaluateInitiative, type InitiativeRules } from "@/lib/domain/initiatives";
import { dateNum, evalRule, validateRuleJson } from "@/lib/domain/rules-engine";

const R = (all: { m: string; op: ">=" | "<=" | ">" | "<" | "="; v: number }[]) => ({ all });

const BET3: InitiativeRules = {
  scale: R([{ m: "outreached", op: ">=", v: 20 }, { m: "response_rate", op: ">=", v: 0.5 }, { m: "proposal_rate", op: ">=", v: 0.4 }]),
  change: R([{ m: "outreached", op: ">=", v: 20 }, { m: "response_rate", op: ">=", v: 0.3 }, { m: "response_rate", op: "<", v: 0.5 }]),
  stop: R([{ m: "outreached", op: ">=", v: 30 }, { m: "response_rate", op: "<", v: 0.2 }]),
};
const BET5: InitiativeRules = {
  scale: R([{ m: "prospective_or_better", op: ">=", v: 5 }, { m: "personalised_vs_template_ratio", op: ">=", v: 2 }]),
  change: null,
  stop: R([{ m: "outreached", op: ">=", v: 40 }, { m: "proposal_rate", op: "<", v: 0.05 }, { m: "signed_deals", op: "<=", v: 0 }]),
};
const BET1: InitiativeRules = {
  scale: R([{ m: "negotiating_count", op: ">=", v: 5 }, { m: "today", op: "<=", v: 20261211 }]),
  change: R([{ m: "top5_max_idle_bdays", op: ">", v: 3 }]),
  stop: R([{ m: "deals_idle_gt10_after_3_nudges", op: ">=", v: 1 }]),
};
const BET2: InitiativeRules = {
  scale: null,
  change: R([{ m: "inkind_share_new", op: ">", v: 0.1 }]),
  stop: R([{ m: "today", op: ">=", v: 20270104 }]),
};

describe("rules engine", () => {
  it("evaluates and treats missing metrics as unknown", () => {
    expect(evalRule(R([{ m: "outreached", op: ">=", v: 20 }]), { outreached: 20 }).met).toBe(true);
    expect(evalRule(R([{ m: "outreached", op: ">=", v: 20 }]), {}).met).toBeNull();
    expect(evalRule(R([{ m: "outreached", op: ">=", v: 20 }, { m: "x", op: "<", v: 1 }]), { outreached: 5 }).met).toBe(false);
    expect(evalRule(null, { outreached: 5 }).met).toBe(false);
  });
  it("validates rule json", () => {
    expect(validateRuleJson(null)).toEqual([]);
    expect(validateRuleJson(R([{ m: "outreached", op: ">=", v: 1 }]))).toEqual([]);
    expect(validateRuleJson(R([{ m: "nope", op: ">=", v: 1 }])).length).toBe(1);
    expect(validateRuleJson({ all: [] }).length).toBe(1);
    expect(validateRuleJson("x").length).toBe(1);
  });
});

describe("initiative badges", () => {
  it("bet-3 scale, change, stop, hold, too early", () => {
    expect(evaluateInitiative("bet-3", BET3, { outreached: 24, response_rate: 0.58, proposal_rate: 0.45 }).badge).toBe("SCALE");
    expect(evaluateInitiative("bet-3", BET3, { outreached: 24, response_rate: 0.4, proposal_rate: 0.2 }).badge).toBe("CHANGE");
    expect(evaluateInitiative("bet-3", BET3, { outreached: 34, response_rate: 0.15, proposal_rate: 0 }).badge).toBe("STOP");
    expect(evaluateInitiative("bet-3", BET3, { outreached: 24, response_rate: 0.55, proposal_rate: 0.2 }).badge).toBe("HOLD");
    expect(evaluateInitiative("bet-3", BET3, { outreached: 8, response_rate: 0.5, proposal_rate: 0.5 }).badge).toBe("TOO EARLY");
  });
  it("reason sentences carry raw counts when given", () => {
    const r = evaluateInitiative("bet-3", BET3, { outreached: 24, response_rate: 0.58 }, { outreached: "24 outreached", response_rate: "14 of 24 responded" });
    expect(r.reason).toContain("14 of 24 responded");
  });
  it("bet-5 reports insufficient data when the template arm is empty", () => {
    const r = evaluateInitiative("bet-5", BET5, { outreached: 45, proposal_rate: 0.1, prospective_or_better: 6, signed_deals: 0, personalised_vs_template_ratio: undefined });
    expect(r.badge).toBe("HOLD");
    expect(r.reason).toContain("Insufficient data");
  });
  it("bet-5 stops on a cold lane with no proposals", () => {
    expect(evaluateInitiative("bet-5", BET5, { outreached: 42, proposal_rate: 0.02, signed_deals: 0 }).badge).toBe("STOP");
  });
  it("bet-1 scale, behind, change, stop", () => {
    const t = dateNum("2026-12-08");
    expect(evaluateInitiative("bet-1", BET1, { negotiating_count: 5, today: t, top5_max_idle_bdays: 1 }).badge).toBe("SCALE");
    expect(evaluateInitiative("bet-1", BET1, { negotiating_count: 3, today: dateNum("2026-12-12"), top5_max_idle_bdays: 1 }).badge).toBe("BEHIND");
    expect(evaluateInitiative("bet-1", BET1, { negotiating_count: 3, today: t, top5_max_idle_bdays: 8 }).badge).toBe("CHANGE");
    expect(evaluateInitiative("bet-1", BET1, { negotiating_count: 3, today: t, top5_max_idle_bdays: 1, deals_idle_gt10_after_3_nudges: 1 }).badge).toBe("STOP");
  });
  it("bet-2 changes on in-kind creep and stops on the date rule", () => {
    expect(evaluateInitiative("bet-2", BET2, { inkind_share_new: 0.14, today: dateNum("2026-12-20") }).badge).toBe("CHANGE");
    expect(evaluateInitiative("bet-2", BET2, { inkind_share_new: 0.05, today: dateNum("2027-01-04") }).badge).toBe("STOP");
    expect(evaluateInitiative("bet-2", BET2, { inkind_share_new: 0.05, today: dateNum("2026-12-20") }).badge).toBe("HOLD");
  });
});

describe("decisions", () => {
  const snap: DecisionSnapshot = {
    initiatives: [{ code: "bet-5", name: "Capped cold test", badge: "STOP", reason: "Stop rule met: 42 outreached." }, { code: "bet-3", name: "Warm renewals", badge: "HOLD", reason: "x" }],
    coordinators: [
      { id: "ishita", name: "Ishita Rao", activeCount: 12, idleBdays: 4, outreachedThisWeek: 0, weeklyTarget: 10, bdaysElapsed: 5, bdaysInWeek: 5, ghosting: 1, engagedPool: 10 },
      { id: "rohan", name: "Rohan Mehta", activeCount: 9, idleBdays: 1, outreachedThisWeek: 6, weeklyTarget: 10, bdaysElapsed: 5, bdaysInWeek: 5, ghosting: 8, engagedPool: 20 },
    ],
    staleProspects: [{ brandId: "b1", company: "Northwind Motors (demo)", ownerId: "arjun", ownerName: "Arjun", amountInr: 500_000, idleBdays: 8, thresholdBdays: 3 }],
    overduePayments: [],
    ownershipConflicts: [{ company: "Acme", ownerIds: ["a", "b"], ownerNames: ["A", "B"] }],
    gates: [{ gateOn: "2026-12-07", baseInr: 1_320_000, stretchInr: 1_680_000, actualInr: 1_100_000, status: "BEHIND BASE", beatsStretch: false, gapToBase: 220_000 }],
  };
  const d = buildDecisions(snap);
  const ids = d.map((x) => x.id);
  it("raises the expected decisions", () => {
    expect(ids).toContain("initiative-bet-5");
    expect(ids).not.toContain("initiative-bet-3");
    expect(ids).toContain("idle-ishita");
    expect(ids).toContain("pace-ishita");
    expect(ids).not.toContain("pace-rohan");
    expect(ids).toContain("ghost-rohan");
    expect(ids).not.toContain("ghost-ishita");
    expect(ids).toContain("stale-prospects");
    expect(ids).toContain("conflict-acme");
    expect(ids).toContain("replan-gates");
  });
  it("includes the 5,00,000 deal in the stale evidence and creates tasks", () => {
    const s = d.find((x) => x.id === "stale-prospects");
    expect(s?.evidence).toContain("5,00,000");
    expect(s?.tasksToCreate[0]?.ownerId).toBe("arjun");
  });
  it("sorts high severity first", () => {
    expect(d[0]?.severity).toBe("high");
    expect(d.at(-1)?.severity).toBe("low");
  });
});