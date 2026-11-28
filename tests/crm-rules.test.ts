import { describe, expect, it } from "vitest";
import { isLegalDealMove, isLegalTransition, legalNextDealStages, legalNextStatuses, validateTransition } from "@/lib/domain/crm-rules";

describe("crm status rules", () => {
  it("only allows Didn't Pick from To Contact or Send Mail", () => {
    expect(isLegalTransition("to_contact", "didnt_pick")).toBe(true);
    expect(isLegalTransition("send_mail", "didnt_pick")).toBe(true);
    expect(isLegalTransition("contacted", "didnt_pick")).toBe(false);
  });
  it("only allows Ghosting from Contacted or Prospective", () => {
    expect(isLegalTransition("contacted", "ghosting")).toBe(true);
    expect(isLegalTransition("prospective", "ghosting")).toBe(true);
    expect(isLegalTransition("didnt_pick", "ghosting")).toBe(false);
  });
  it("treats final statuses as closed", () => {
    expect(legalNextStatuses("converted")).toEqual([]);
    expect(legalNextStatuses("rejected")).toEqual([]);
  });
  it("hides Slabs sent and To Contact from the dropdown", () => {
    const next = legalNextStatuses("to_contact");
    expect(next).not.toContain("slabs_sent");
    expect(next).not.toContain("to_contact");
    expect(next).toContain("send_mail");
  });
  it("asks for the right fields", () => {
    expect(validateTransition("contacted", { brandId: "b", to: "prospective" })).toContain("amount");
    expect(validateTransition("contacted", { brandId: "b", to: "prospective", approxAmountInr: 100_000 })).toBeNull();
    expect(validateTransition("prospective", { brandId: "b", to: "converted", finalAmountInr: 500_000, inKindInr: 600_000 })).toContain("In-kind");
    expect(validateTransition("prospective", { brandId: "b", to: "converted", finalAmountInr: 500_000, inKindInr: 50_000 })).toBeNull();
    expect(validateTransition("contacted", { brandId: "b", to: "rejected" })).toContain("reason");
    expect(validateTransition("contacted", { brandId: "b", to: "didnt_pick" })).toContain("Didn't Pick");
  });
});

describe("deal stage rules", () => {
  it("confirms only from MoU sent", () => {
    expect(isLegalDealMove("mou_sent", "partner_confirmed")).toBe(true);
    expect(isLegalDealMove("negotiating", "partner_confirmed")).toBe(false);
    expect(isLegalDealMove("prospecting", "partner_confirmed")).toBe(false);
  });
  it("moves between open stages and to lost from any open stage", () => {
    expect(isLegalDealMove("proposal_sent", "negotiating")).toBe(true);
    expect(isLegalDealMove("negotiating", "mou_sent")).toBe(true);
    expect(isLegalDealMove("mou_sent", "negotiating")).toBe(true);
    for (const s of ["prospecting", "proposal_sent", "negotiating", "mou_sent"] as const) expect(isLegalDealMove(s, "lost")).toBe(true);
  });
  it("closes confirmed and lost deals", () => {
    expect(legalNextDealStages("partner_confirmed")).toEqual([]);
    expect(legalNextDealStages("lost")).toEqual([]);
    expect(isLegalDealMove("negotiating", "negotiating")).toBe(false);
  });
  it("lists MoU sent between negotiating and confirmed", () => {
    expect(legalNextDealStages("prospecting")).toEqual(["proposal_sent", "negotiating", "mou_sent", "lost"]);
    expect(legalNextDealStages("mou_sent")).toEqual(["prospecting", "proposal_sent", "negotiating", "partner_confirmed", "lost"]);
  });
});