import { describe, expect, it } from "vitest";
import { attributeStretch } from "@/lib/model/attribution";
import { DEFAULT_GATES, closingOnlyPhase, gateStatuses, missedBaseGate, paceLine, signedAsOf } from "@/lib/model/gates";
import { mergeSettings, projectPlan, type PlanState } from "@/lib/model/projection";

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
  it("stretch", () => {
    expect(r.stretch.signed).toBe(3_976_250);
    expect(r.stretch.cashBeforeFest).toBe(2_833_078);
  });
  it("stretch with new_only in-kind policy", () => {
    const n = projectPlan(S, mergeSettings({ inkindScope: "new_only" }));
    expect(n.stretch.cashBeforeFest).toBe(NEW_ONLY);
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
    expect(x.stretch.signed).toBe(3_647_000);
    expect(x.stretch.cashBeforeFest).toBe(2_598_488);
  });
});

describe("attribution over the floor", () => {
  const a = attributeStretch(S);
  it("matches the slide", () => {
    const by = Object.fromEntries(a.rows.map((x) => [x.bet, x.cashOverFloor]));
    expect(by["bet-1"]).toBe(830_250);
    expect(by["bet-2"]).toBe(149_109);
    expect(by["bet-3"]).toBe(696_094);
    expect(by["bet-4"]).toBe(379_688);
    expect(by["bet-5"]).toBe(35_438);
  });
  it("sums to stretch minus floor", () => {
    expect(Math.abs(a.sumOverFloor - 2_090_578)).toBeLessThanOrEqual(1000);
    expect(a.reconciles).toBe(true);
  });
  it("reconciles under new_only too", () => {
    expect(attributeStretch(S, mergeSettings({ inkindScope: "new_only" })).reconciles).toBe(true);
  });
});

describe("gates", () => {
  const deals = [
    { confirmedOn: "2026-11-20", amountInr: 700_000 },
    { confirmedOn: "2026-12-03", amountInr: 700_000 },
  ];
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
    expect(s[1]?.gapToBase).toBe(200_000);
    expect(s[2]?.status).toBe("UPCOMING");
    expect(missedBaseGate(s)?.gateOn).toBe("2026-12-14");
  });
  it("closing-only phase starts after 21 Dec", () => {
    expect(closingOnlyPhase(DEFAULT_GATES, "2026-12-21")).toBe(false);
    expect(closingOnlyPhase(DEFAULT_GATES, "2026-12-22")).toBe(true);
  });
  it("pace line anchors at today then gates then end", () => {
    const p = paceLine(DEFAULT_GATES, "2026-12-10", 1_400_000, "2027-01-05", 2_207_500, 3_976_250);
    expect(p.map((x) => x.date)).toEqual(["2026-12-10", "2026-12-14", "2026-12-21", "2027-01-05"]);
    expect(p[0]).toEqual({ date: "2026-12-10", base: 1_400_000, stretch: 1_400_000 });
  });
});

const NEW_ONLY = 2_791_828;