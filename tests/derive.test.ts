import { describe, expect, it } from "vitest";
import {
  buildKpis,
  buildPlanState,
  cashTermsMetrics,
  coordinatorStat,
  dealDeskMetrics,
  experimentArms,
  laneMetrics,
  leadSupply,
  ownershipConflicts,
  staleProspects,
  type BrandRow,
} from "@/lib/model/derive";
import { DEFAULT_SETTINGS, projectPlan } from "@/lib/model/projection";

const brand = (i: number, p: Partial<BrandRow>): BrandRow => ({
  id: `b${i}`, name: `Co ${i}`, owner_id: "o1", crm_status: "contacted", source_channel: "cold_database",
  approx_amount_inr: 0, first_outreach_at: null, last_touch_at: null, next_follow_up: null, initiative_id: null, ...p,
});

function seedLike(): BrandRow[] {
  const out: BrandRow[] = [];
  let i = 0;
  for (let k = 0; k < 25; k++) out.push(brand(i++, { crm_status: k % 5 === 0 ? "send_mail" : "to_contact", source_channel: "past_sponsors" }));
  for (let k = 0; k < 42; k++) out.push(brand(i++, { crm_status: "to_contact", source_channel: "cold_database" }));
  for (let k = 0; k < 14; k++) out.push(brand(i++, { crm_status: "prospective", source_channel: "other_fest", approx_amount_inr: k === 0 ? 3_075_000 - 13 * 100_000 : 100_000 }));
  return out;
}
const signed = [
  { dealId: "d1", brandId: "x1", amountInr: 700_000, cashInr: 640_000, inKindInr: 60_000, confirmedOn: "2026-11-15" },
  { dealId: "d2", brandId: "x2", amountInr: 300_000, cashInr: 250_000, inKindInr: 50_000, confirmedOn: "2026-11-20" },
  { dealId: "d3", brandId: "x3", amountInr: 100_000, cashInr: 100_000, inKindInr: 0, confirmedOn: "2026-11-22" },
];

describe("plan state from rows", () => {
  const st = buildPlanState(seedLike(), signed);
  it("reads open prospects, queue split and observed in-kind", () => {
    expect(st.openProspectInr).toBe(3_075_000);
    expect(st.openProspectCount).toBe(14);
    expect(st.queueWarm).toBe(25);
    expect(st.queueOther).toBe(42);
    expect(st.signedToDate).toBe(1_100_000);
    expect(st.signedDealsToDate).toBe(3);
    expect(st.observedInkindShare).toBeCloseTo(0.1, 9);
  });
  it("feeds the model to the slide numbers", () => {
    const p = projectPlan({ ...st, signedDealsToDate: 4 });
    expect(p.floor).toBe(742_500);
    expect(p.base.cashBeforeFest).toBe(1_490_063);
    expect(p.stretch.cashBeforeFest).toBe(2_499_094);
  });
  it("has a 35 warm lead gap to stretch", () => {
    const s = leadSupply(seedLike(), DEFAULT_SETTINGS);
    expect(s.warmPool).toBe(25);
    expect(s.gapToStretch).toBe(35);
    expect(s.gapToBase).toBe(0);
    expect(s.perBet[0]?.need).toBe(45);
    expect(s.perBet[1]?.need).toBe(15);
  });
  it("counts warm companies outreached since the plan start", () => {
    const rows = [...seedLike(), brand(999, { crm_status: "contacted", source_channel: "other_fest", first_outreach_at: "2026-12-02T05:00:00Z" }), brand(998, { crm_status: "contacted", source_channel: "other_fest", first_outreach_at: "2026-11-10T05:00:00Z" })];
    expect(leadSupply(rows, DEFAULT_SETTINGS).warmPool).toBe(26);
  });
});

describe("kpis and funnel", () => {
  const k = buildKpis([
    { companies: 100, outreached: 70, responded: 40, prospective_or_better: 10, converted: 4 },
    { companies: 120, outreached: 83, responded: 64, prospective_or_better: 8, converted: 0 },
  ]);
  it("sums warm and other and finds the bottleneck", () => {
    expect(k.companies).toBe(220);
    expect(k.outreached).toBe(153);
    expect(k.responded).toBe(104);
    expect(k.funnel[1]?.rateFromPrev).toBeCloseTo(104 / 153, 9);
    expect(k.bottleneck).toBe("prospective_or_better");
  });
});

describe("initiative metrics", () => {
  it("lane rates and counts", () => {
    const m = laneMetrics({ outreached: 24, responded: 14, prospective_or_better: 6, converted: 2 }, 20261127);
    expect(m.metrics.response_rate).toBeCloseTo(14 / 24, 9);
    expect(m.metrics.proposal_rate).toBeCloseTo(6 / 14, 9);
    expect(m.counts.response_rate).toBe("14 of 24 responded");
    expect(laneMetrics(undefined, 1).metrics.response_rate).toBeUndefined();
  });
  it("deal desk metrics use the top 5 by amount", () => {
    const rows = [
      { company: "Northwind", stage: "proposal_sent", proposed_inr: 500_000, idle_bdays: 8, nudges: 1 },
      { company: "Veridian", stage: "negotiating", proposed_inr: 400_000, idle_bdays: 1, nudges: 0 },
      { company: "Skyline", stage: "negotiating", proposed_inr: 350_000, idle_bdays: 2, nudges: 0 },
      { company: "Tiny", stage: "prospecting", proposed_inr: 10_000, idle_bdays: 15, nudges: 4 },
    ];
    const m = dealDeskMetrics(rows, 20261127);
    expect(m.metrics.top5_max_idle_bdays).toBe(15);
    expect(m.metrics.negotiating_count).toBe(2);
    expect(m.metrics.deals_idle_gt10_after_3_nudges).toBe(1);
    const only3 = dealDeskMetrics(rows.slice(0, 3), 20261127);
    expect(only3.metrics.top5_max_idle_bdays).toBe(8);
  });
  it("cash-first terms looks only at deals confirmed since the plan start", () => {
    expect(cashTermsMetrics(signed, "2026-11-30", 20261127).metrics.inkind_share_new).toBeUndefined();
    const m = cashTermsMetrics([...signed, { dealId: "d4", brandId: "x4", amountInr: 200_000, cashInr: 180_000, inKindInr: 20_000, confirmedOn: "2026-12-03" }], "2026-11-30", 20261204);
    expect(m.metrics.inkind_share_new).toBeCloseTo(0.1, 9);
  });
  it("experiment ratio is undefined when the template arm has no proposals", () => {
    const ids = new Set(["a", "b", "c", "d"]);
    const drafts = [
      { brand_id: "a", personalised: true, status: "sent" }, { brand_id: "b", personalised: true, status: "sent" },
      { brand_id: "c", personalised: false, status: "sent" }, { brand_id: "d", personalised: false, status: "draft" },
    ];
    const none = experimentArms(ids, drafts, [{ brand_id: "a", to_status: "prospective" }]);
    expect(none.personalised).toEqual({ n: 2, reached: 1, rate: 0.5 });
    expect(none.template.n).toBe(1);
    expect(none.ratio).toBeUndefined();
    expect(none.directionalOnly).toBe(true);
    const some = experimentArms(ids, drafts, [{ brand_id: "a", to_status: "prospective" }, { brand_id: "c", to_status: "converted" }]);
    expect(some.ratio).toBeCloseTo(0.5, 9);
  });
});

describe("decision inputs", () => {
  const names = new Map([["o1", "Aarav"], ["o2", "Kavya"]]);
  it("finds ownership conflicts ignoring demo tags and punctuation", () => {
    const rows = [brand(1, { name: "Acme Pvt. Ltd. (demo)", owner_id: "o1" }), brand(2, { name: "ACME", owner_id: "o2" }), brand(3, { name: "Solo", owner_id: "o1" })];
    const c = ownershipConflicts(rows, names);
    expect(c.length).toBe(1);
    expect(c[0]?.ownerNames.sort()).toEqual(["Aarav", "Kavya"]);
  });
  it("flags stale prospects past the threshold and honours snoozes", () => {
    const rows = [
      brand(1, { crm_status: "prospective", approx_amount_inr: 500_000, last_touch_at: "2026-11-17T05:00:00Z" }),
      brand(2, { crm_status: "prospective", approx_amount_inr: 100_000, last_touch_at: "2026-11-26T05:00:00Z" }),
      brand(3, { crm_status: "prospective", approx_amount_inr: 200_000, last_touch_at: "2026-11-10T05:00:00Z", next_follow_up: "2026-12-01" }),
    ];
    const s = staleProspects(rows, 3, "2026-11-27", [], names);
    expect(s.length).toBe(1);
    expect(s[0]?.amountInr).toBe(500_000);
    expect(s[0]?.idleBdays).toBe(8);
  });
  it("coordinator stats count active, ghosting and elapsed days", () => {
    const rows = [
      brand(1, { crm_status: "contacted", last_touch_at: "2026-11-23T05:00:00Z" }),
      brand(2, { crm_status: "ghosting", last_touch_at: "2026-11-20T05:00:00Z" }),
      brand(3, { crm_status: "to_contact", owner_id: "o2" }),
    ];
    const s = coordinatorStat({ id: "o1", name: "Aarav" }, rows, { outreached: 6, target: 10 }, "2026-11-27", [], { inWeek: 5, left: 1 });
    expect(s.activeCount).toBe(1);
    expect(s.ghosting).toBe(1);
    expect(s.engagedPool).toBe(2);
    expect(s.idleBdays).toBe(4);
    expect(s.bdaysElapsed).toBe(5);
    const weekend = coordinatorStat({ id: "o1", name: "A" }, rows, { outreached: 0, target: 10 }, "2026-11-28", [], { inWeek: 5, left: 0 });
    expect(weekend.bdaysElapsed).toBe(5);
    const monday = coordinatorStat({ id: "o1", name: "A" }, rows, { outreached: 0, target: 10 }, "2026-11-30", [], { inWeek: 5, left: 5 });
    expect(monday.bdaysElapsed).toBe(1);
  });
});