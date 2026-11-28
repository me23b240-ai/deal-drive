import { describe, expect, it } from "vitest";
import { channelToInitiative, netShare } from "@/lib/domain/channels";
import { buildPlanState, normName, type BrandRow } from "@/lib/model/derive";

const brand = (i: number, p: Partial<BrandRow>): BrandRow => ({
  id: `b${i}`, name: `Co ${i}`, owner_id: "o1", crm_status: "to_contact", source_channel: "cold_database",
  approx_amount_inr: 0, first_outreach_at: null, last_touch_at: null, next_follow_up: null, initiative_id: null, ...p,
});

describe("lead dedupe names", () => {
  it("treats legal suffixes and demo tags as the same company", () => {
    expect(normName("Acme Pvt. Ltd. (demo)")).toBe(normName("ACME"));
    expect(normName("Acme India Group")).toBe(normName("acme"));
    expect(normName("Acme")).not.toBe(normName("Acme Foods"));
  });
});

describe("agency net share in the forecast", () => {
  it("weights queued agency leads by 85 percent", () => {
    const rows = [brand(1, {}), brand(2, { source_channel: "agency", agency_commission_pct: 15 }), brand(3, { source_channel: "agency", agency_commission_pct: 0 })];
    expect(buildPlanState(rows, []).queueOther).toBeCloseTo(2.85, 9);
  });
  it("leaves seeded brands unchanged when the commission is missing", () => {
    expect(buildPlanState([brand(1, {}), brand(2, {})], []).queueOther).toBe(2);
  });
  it("exposes the net share and the bet for an agency lead", () => {
    expect(netShare("agency")).toBe(0.85);
    expect(channelToInitiative("agency")).toBe("bet-5");
  });
});