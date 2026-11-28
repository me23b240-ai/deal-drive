import { describe, expect, it } from "vitest";
import { buildDecisions, type DecisionSnapshot } from "@/lib/domain/decisions";
import { evaluateInitiative, type InitiativeRules } from "@/lib/domain/initiatives";
import { validateRuleJson } from "@/lib/domain/rules-engine";
import { introMetrics, mouLagMax, offerMetrics, type DealLite, type ItemLite } from "@/lib/model/metrics-v2";
import { GATES, INITIATIVES } from "@/lib/seed/constants/saarang-bets";

const rulesOf = (code: string): InitiativeRules => {
  const b = INITIATIVES.find((x) => x.code === code);
  if (!b) throw new Error(`no ${code}`);
  return { scale: b.scale, change: b.change, stop: b.stop };
};

describe("seeded bets", () => {
  it("has five bets with the planned budgets", () => {
    expect(INITIATIVES.map((b) => b.code)).toEqual(["bet-1", "bet-2", "bet-3", "bet-4", "bet-5"]);
    expect(INITIATIVES.map((b) => b.budget)).toEqual([0, 0, 10_000, 5_000, 15_000]);
  });
  it("validates every seeded rule", () => {
    for (const b of INITIATIVES) for (const r of [b.scale, b.change, b.stop]) expect(validateRuleJson(r)).toEqual([]);
  });
  it("seeds the new gates", () => {
    expect(GATES).toEqual([
      ["2026-12-07", 1_321_500, 1_581_500],
      ["2026-12-14", 1_543_000, 2_063_000],
      ["2026-12-21", 1_764_500, 2_544_500],
    ]);
  });
});

describe("new metrics", () => {
  const deals: DealLite[] = [
    { id: "d1", stage: "proposal_sent", proposedInr: 150_000, signedCashInr: 0, paymentTerms: "75_25", confirmedOn: null },
    { id: "d2", stage: "negotiating", proposedInr: 100_000, signedCashInr: 0, paymentTerms: "75_25", confirmedOn: null },
    { id: "d3", stage: "partner_confirmed", proposedInr: 200_000, signedCashInr: 200_000, paymentTerms: "100_0", confirmedOn: "2026-12-08" },
    { id: "d4", stage: "prospecting", proposedInr: 50_000, signedCashInr: 0, paymentTerms: "75_25", confirmedOn: null },
    { id: "d5", stage: "partner_confirmed", proposedInr: 200_000, signedCashInr: 200_000, paymentTerms: "75_25", confirmedOn: "2026-12-12" },
  ];
  const items: ItemLite[] = [
    { dealId: "d1", isUgc: true, category: null },
    { dealId: "d3", isUgc: false, category: "Package" },
  ];
  it("computes offer design metrics", () => {
    const m = offerMetrics(deals, items, "2026-12-10", 20261205).metrics;
    expect(m.proposals_count).toBe(4);
    expect(m.bundle_share).toBeCloseTo(0.5, 9);
    expect(m.avg_proposed_inr).toBe(162_500);
    expect(m.prefest_share).toBeCloseTo(0.875, 9);
    expect(m.early_bird_share).toBeCloseTo(0.5, 9);
  });
  it("leaves shares undefined when there is nothing to measure", () => {
    const m = offerMetrics([], [], "2026-12-10", 1).metrics;
    expect(m.bundle_share).toBeUndefined();
    expect(m.avg_proposed_inr).toBeUndefined();
    expect(m.prefest_share).toBeUndefined();
  });
  it("computes intro yield only when there are asks", () => {
    expect(introMetrics(0, 0).metrics.intro_yield).toBeUndefined();
    expect(introMetrics(10, 3).metrics.intro_yield).toBeCloseTo(0.3, 9);
  });
  it("finds the longest unsigned MoU wait in business days", () => {
    const rows = [
      { stage: "mou_sent", mouSentAt: "2026-12-01T05:00:00Z" },
      { stage: "mou_sent", mouSentAt: "2026-12-07T05:00:00Z" },
      { stage: "negotiating", mouSentAt: "2026-11-01T05:00:00Z" },
    ];
    expect(mouLagMax(rows, "2026-12-09", [])).toBe(6);
    expect(mouLagMax([], "2026-12-09", [])).toBe(0);
  });
});

describe("badges for the new bets", () => {
  it("bet-4 scales, changes and stops on intro yield", () => {
    const r = rulesOf("bet-4");
    expect(evaluateInitiative("bet-4", r, { intro_asks: 12, intro_yield: 0.35, today: 20261205 }).badge).toBe("SCALE");
    expect(evaluateInitiative("bet-4", r, { intro_asks: 12, intro_yield: 0.2, today: 20261205 }).badge).toBe("CHANGE");
    expect(evaluateInitiative("bet-4", r, { intro_asks: 12, intro_yield: 0.05, today: 20261205 }).badge).toBe("STOP");
  });
  it("bet-3 scales on bundles and stops after 14 Dec without them", () => {
    const r = rulesOf("bet-3");
    expect(evaluateInitiative("bet-3", r, { proposals_count: 12, bundle_share: 0.4, avg_proposed_inr: 130_000, today: 20261205 }).badge).toBe("SCALE");
    expect(evaluateInitiative("bet-3", r, { proposals_count: 3, bundle_share: 0.05, today: 20261215 }).badge).toBe("STOP");
  });
  it("bet-5 stops on the engine rule and holds without data", () => {
    const r = rulesOf("bet-5");
    expect(evaluateInitiative("bet-5", r, { qualified_candidates: 12, today: 20261205 }).badge).toBe("STOP");
    expect(evaluateInitiative("bet-5", r, { qualified_candidates: 25, today: 20261205 }).badge).toBe("HOLD");
  });
  it("bet-2 follows the warm lane rates", () => {
    const r = rulesOf("bet-2");
    expect(evaluateInitiative("bet-2", r, { outreached: 24, response_rate: 0.58, proposal_rate: 0.45 }).badge).toBe("SCALE");
    expect(evaluateInitiative("bet-2", r, { outreached: 34, response_rate: 0.15, proposal_rate: 0 }).badge).toBe("STOP");
  });
});

describe("new decisions", () => {
  const empty: DecisionSnapshot = { initiatives: [], coordinators: [], staleProspects: [], overduePayments: [], ownershipConflicts: [], gates: [] };
  const withV2 = (extra: number) =>
    buildDecisions({
      ...empty,
      v2: {
        mouSent: [
          { dealId: "d1", company: "Acme", ownerId: "o1", ownerName: "Aarav", amountInr: 300_000, lagBdays: 6 },
          { dealId: "d2", company: "Zed", ownerId: "o2", ownerName: "Kavya", amountInr: 100_000, lagBdays: 2 },
        ],
        termsPending: [{ dealId: "d3", company: "Beta", ownerName: "Dev", amountInr: 200_000, ageBdays: 2 }],
        peerFest: { total: 12, notStarted: 12, bdaysSincePlanStart: 3 },
        upside: { extraQualified: extra, byDate: "2026-12-11", today: "2026-12-08" },
      },
    });
  it("raises MoU, terms, peer-fest and upside decisions", () => {
    const d = withV2(27);
    const ids = d.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(["mou-unsigned", "terms-pending", "peerfest-research", "upside-trigger"]));
    const mou = d.find((x) => x.id === "mou-unsigned");
    expect(mou?.severity).toBe("high");
    expect(mou?.evidence).toContain("Acme");
    expect(mou?.evidence).not.toContain("Zed");
    expect(d.find((x) => x.id === "upside-trigger")?.severity).toBe("low");
  });
  it("skips the upside decision below 25 leads", () => {
    expect(withV2(10).some((x) => x.id === "upside-trigger")).toBe(false);
  });
});