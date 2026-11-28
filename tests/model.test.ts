import { describe, expect, it } from "vitest";
import { attributeStretch } from "@/lib/model/attribution";
import { DEFAULT_GATES, closingOnlyPhase, gateStatuses, missedBaseGate, paceLine, signedAsOf } from "@/lib/model/gates";
import { DEFAULT_SETTINGS, mergeSettings, projectPlan, type PlanState } from "@/lib/model/projection";

const S: PlanState = {
  signedToDate: 1_100_000, signedDealsToDate: 4, openProspectInr: 3_075_000, openProspectCount: 14,
  queueWarm: 25, queueOther: 42, observedInkindShare: 0.1,
};

describe("projection (seeded state)", () => {
  const r = projectPlan(S);
  it("floor cash", () => expect(r.floor).toBe(742_500));
  it("base", () => {
    expect(r.base.signed).toBe(2_207_500);
    expect(r.base.cashBeforeFest).toBe(1_490_063);
    expect(r.base.totalDeals).toBeCloseTo(10.21, 6);
  });
  it("stretch is locked at 25.0L", () => {
    expect(r.stretch.signed).toBe(3_507_500);
    expect(r.stretch.cashBeforeFest).toBe(2_499_094);
  });
  it("defaults use 60 total warm leads and a 45/15 split", () => {
    expect(DEFAULT_SETTINGS.stretchWarmLeads).toBe(60);
    expect(DEFAULT_SETTINGS.stretchOtherLeads).toBe(42);
    expect(DEFAULT_SETTINGS.warmSplit).toEqual({ network: 45, referral: 15 });
    expect(DEFAULT_SETTINGS.baselineAvgDeal).toBe(93_000);
  });
  it("stretch with new_only in-kind policy", () => {
    const n = projectPlan(S, mergeSettings({ inkindScope: "new_only" }));
    expect(n.stretch.cashBeforeFest).toBe(2_457_844);
    expect(n.stretch.cashBeforeFest).toBeLessThan(r.stretch.cashBeforeFest);
    expect(n.base.cashBeforeFest).toBe(r.base.cashBeforeFest);
  });
  it("base with close rate 0.30", () => {
    const x = projectPlan(S, mergeSettings({ base: { closeRate: 0.3 } }));
    expect(x.base.signed).toBe(2_361_250);
    expect(x.base.cashBeforeFest).toBe(1_593_844);
  });
  it("stretch with 1L average deal", () => {
    const x = projectPlan(S, mergeSettings({ avgNewDeal: 100_000 }));
    expect(x.stretch.signed).toBe(3_272_000);
    expect(x.stretch.cashBeforeFest).toBe(2_331_300);
  });
  it("upside case with 85 warm leads is higher than stretch", () => {
    const x = projectPlan(S, mergeSettings({ stretchWarmLeads: 85 }));
    expect(x.stretch.cashBeforeFest).toBeGreaterThan(r.stretch.cashBeforeFest);
  });
  it("merges a partial warm split and ignores bad values", () => {
    const m = mergeSettings({ warmSplit: { network: 30, referral: "x" } });
    expect(m.warmSplit).toEqual({ network: 30, referral: 15 });
  });
});

describe("attribution over the floor", () => {
  const a = attributeStretch(S);
  const by = Object.fromEntries(a.rows.map((x) => [x.bet, x.cashOverFloor]));
  it("matches the plan within 1,000 per bet", () => {
    expect(by["bet-1"]).toBe(830_250);
    expect(Math.abs((by["bet-2"] ?? 0) - 423_700)).toBeLessThanOrEqual(1000);
    expect(Math.abs((by["bet-3"] ?? 0) - 335_000)).toBeLessThanOrEqual(1000);
    expect(Math.abs((by["bet-4"] ?? 0) - 141_200)).toBeLessThanOrEqual(1000);
    expect(Math.abs((by["bet-5"] ?? 0) - 26_400)).toBeLessThanOrEqual(1000);
  });
  it("lists the five bets in order", () => {
    expect(a.rows.map((x) => x.bet)).toEqual(["bet-1", "bet-2", "bet-3", "bet-4", "bet-5"]);
  });
  it("sums to stretch minus floor", () => {
    expect(Math.abs(a.sumOverFloor - (2_499_094 - 742_500))).toBeLessThanOrEqual(1000);
    expect(a.reconciles).toBe(true);
  });
  it("reconciles under new_only and with other settings", () => {
    expect(attributeStretch(S, mergeSettings({ inkindScope: "new_only" })).reconciles).toBe(true);
    expect(attributeStretch(S, mergeSettings({ avgNewDeal: 100_000 })).reconciles).toBe(true);
    expect(attributeStretch(S, mergeSettings({ stretchWarmLeads: 85 })).reconciles).toBe(true);
    expect(attributeStretch(S, mergeSettings({ avgNewDeal: 80_000 })).reconciles).toBe(true);
  });
});

describe("gates", () => {
  const deals = [
    { confirmedOn: "2026-11-20", amountInr: 700_000 },
    { confirmedOn: "2026-12-03", amountInr: 700_000 },
  ];
  it("uses the 20/40/60 percent pacing values", () => {
    expect(DEFAULT_GATES.map((g) => g.baseInr)).toEqual([1_321_500, 1_543_000, 1_764_500]);
    expect(DEFAULT_GATES.map((g) => g.stretchInr)).toEqual([1_581_500, 2_063_000, 2_544_500]);
  });
  it("signedAsOf is inclusive by date", () => {
    expect(signedAsOf(deals, "2026-12-03")).toBe(1_400_000);
    expect(signedAsOf(deals, "2026-12-02")).toBe(700_000);
  });
  it("all gates upcoming before 7 Dec", () => {
    expect(gateStatuses(DEFAULT_GATES, deals, "2026-11-30").every((g) => g.status === "UPCOMING")).toBe(true);
  });
  it("marks on track and behind base", () => {
    const s = gateStatuses(DEFAULT_GATES, deals, "2026-12-15");
    expect(s[0]?.status).toBe("ON TRACK");
    expect(s[1]?.status).toBe("BEHIND BASE");
    expect(s[1]?.gapToBase).toBe(143_000);
    expect(s[2]?.status).toBe("UPCOMING");
    expect(missedBaseGate(s)?.gateOn).toBe("2026-12-14");
  });
  it("closing-only phase starts after 21 Dec", () => {
    expect(closingOnlyPhase(DEFAULT_GATES, "2026-12-21")).toBe(false);
    expect(closingOnlyPhase(DEFAULT_GATES, "2026-12-22")).toBe(true);
  });
  it("pace line anchors at today then gates then end", () => {
    const p = paceLine(DEFAULT_GATES, "2026-12-10", 1_400_000, "2027-01-05", 2_207_500, 3_507_500);
    expect(p.map((x) => x.date)).toEqual(["2026-12-10", "2026-12-14", "2026-12-21", "2027-01-05"]);
    expect(p[0]).toEqual({ date: "2026-12-10", base: 1_400_000, stretch: 1_400_000 });
  });
});