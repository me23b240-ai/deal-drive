import { describe, expect, it } from "vitest";
import { canMoveCreator, dmUrl, normaliseHandle } from "@/lib/domain/creators";
import { renderMou, validateMou, MOU_BANNER, DELIVERY_WINDOW_PLACEHOLDER, type MouFields } from "@/lib/domain/mou-template";
import { paymentRowsByTerms } from "@/lib/domain/payments";
import { checkDealMove, pipelineStep, validateConversion } from "@/lib/domain/pipeline";
import { dmFollowUpDate, sequenceTasks } from "@/lib/domain/sequence";
import { evaluateSlab, type SlabInput, type SlabItem } from "@/lib/domain/slab";

const item = (over: Partial<SlabItem> = {}): SlabItem => ({ name: "Banner", qty: 1, unitPriceInr: 100_000, inKind: false, isCustom: false, priceMinInr: 80_000, soldElsewhere: false, ...over });
const slab = (over: Partial<SlabInput> = {}): SlabInput => ({
  items: [item()], discountInr: 0, terms: "100_0", today: "2026-12-01", sector: null, competing: [],
  settings: { exclusiveSectors: [], earlyBirdDeadline: null, earlyBirdPct: null }, ...over,
});

describe("stage rules", () => {
  const ok = { itemCount: 1, paymentTerms: "75_25", termsStatus: "ok", mouSignedOn: null };
  it("blocks skipping stages with a friendly message", () => {
    expect(checkDealMove("prospecting", "negotiating", ok)).toContain("Proposal sent");
  });
  it("blocks the MoU without deliverables or while terms await approval", () => {
    expect(checkDealMove("negotiating", "mou_sent", { ...ok, itemCount: 0 })).toContain("deliverable");
    expect(checkDealMove("negotiating", "mou_sent", { ...ok, termsStatus: "pending_approval" })).toContain("approval");
    expect(checkDealMove("negotiating", "mou_sent", ok)).toBeNull();
  });
  it("only allows signing from MoU sent, with the signed date", () => {
    expect(checkDealMove("negotiating", "partner_confirmed", ok)).toContain("Send the MoU");
    expect(checkDealMove("mou_sent", "partner_confirmed", ok)).toContain("signed date");
    expect(checkDealMove("mou_sent", "partner_confirmed", { ...ok, mouSignedOn: "2026-12-20" })).toBeNull();
  });
  it("converted needs signed date, terms and a deliverable", () => {
    expect(validateConversion({ itemCount: 0, paymentTerms: "100_0", termsStatus: "ok", mouSignedOn: "2026-12-20" })).toContain("deliverable");
    expect(validateConversion({ itemCount: 1, paymentTerms: null, termsStatus: "ok", mouSignedOn: "2026-12-20" })).toContain("terms");
  });
  it("places a company on the stepper", () => {
    const base = { itemCount: 0, paymentTerms: null, termsStatus: null };
    expect(pipelineStep({ ...base, crmStatus: "slabs_sent", dealStage: null })).toBe(0);
    expect(pipelineStep({ ...base, crmStatus: "contacted", dealStage: null })).toBe(1);
    expect(pipelineStep({ ...base, crmStatus: "prospective", dealStage: "proposal_sent" })).toBe(2);
    expect(pipelineStep({ ...base, itemCount: 2, crmStatus: "prospective", dealStage: "proposal_sent" })).toBe(3);
    expect(pipelineStep({ ...base, crmStatus: "prospective", dealStage: "mou_sent" })).toBe(6);
    expect(pipelineStep({ ...base, crmStatus: "converted", dealStage: "partner_confirmed" })).toBe(7);
  });
});

describe("slab guards", () => {
  it("passes a clean slab", () => {
    const r = evaluateSlab(slab());
    expect(r.blocked).toEqual([]);
    expect(r.flags).toEqual([]);
    expect(r.termsStatus).toBe("auto");
    expect(r.preFestCashInr).toBe(100_000);
  });
  it("blocks an item sold on another deal", () => {
    expect(evaluateSlab(slab({ items: [item({ soldElsewhere: true })] })).blocked[0]).toContain("already sold");
  });
  it("flags a price below the catalog minimum", () => {
    const r = evaluateSlab(slab({ items: [item({ unitPriceInr: 70_000 })] }));
    expect(r.flags.map((f) => f.code)).toContain("below_floor");
    expect(r.termsStatus).toBe("pending_approval");
  });
  it("caps in-kind at 5% of the deal", () => {
    const over = evaluateSlab(slab({ items: [item(), item({ name: "Goodies", inKind: true, isCustom: true, priceMinInr: null, unitPriceInr: 10_000 })] }));
    expect(over.flags.map((f) => f.code)).toContain("in_kind_cap");
    const fine = evaluateSlab(slab({ items: [item(), item({ name: "Goodies", inKind: true, isCustom: true, priceMinInr: null, unitPriceInr: 5_000 })] }));
    expect(fine.flags.map((f) => f.code)).not.toContain("in_kind_cap");
  });
  it("blocks bundle discounts before 14 Dec 2026", () => {
    expect(evaluateSlab(slab({ discountInr: 5_000, today: "2026-12-13" })).blocked[0]).toContain("14 Dec");
    expect(evaluateSlab(slab({ discountInr: 5_000, today: "2026-12-14" })).blocked).toEqual([]);
  });
  it("sends 50/50 for approval and shows pre-fest cash live", () => {
    const r = evaluateSlab(slab({ terms: "50_50" }));
    expect(r.flags.map((f) => f.code)).toContain("terms_50_50");
    expect(r.preFestCashInr).toBe(50_000);
    expect(evaluateSlab(slab({ terms: "75_25" })).preFestCashInr).toBe(75_000);
  });
  it("warns on a competing deal in an exclusive sector and blocks a confirmed one", () => {
    const settings = { exclusiveSectors: ["fmcg"], earlyBirdDeadline: null, earlyBirdPct: null };
    const warn = evaluateSlab(slab({ sector: "FMCG", settings, competing: [{ company: "Rival", ownerName: "Asha", stage: "negotiating" }] }));
    expect(warn.flags[0]?.text).toContain("Asha");
    expect(warn.blocked).toEqual([]);
    const hard = evaluateSlab(slab({ sector: "fmcg", settings, competing: [{ company: "Rival", ownerName: "Asha", stage: "partner_confirmed" }] }));
    expect(hard.blocked[0]).toContain("Asha");
  });
  it("shows the early-bird price only for 100/0 up to the deadline and needs approval", () => {
    const settings = { exclusiveSectors: [], earlyBirdDeadline: "2026-12-10", earlyBirdPct: 10 };
    const on = evaluateSlab(slab({ settings, today: "2026-12-10" }));
    expect(on.earlyBirdInr).toBe(90_000);
    expect(on.needsApproval).toBe(true);
    expect(evaluateSlab(slab({ settings, today: "2026-12-11" })).earlyBirdInr).toBeNull();
    expect(evaluateSlab(slab({ settings, terms: "75_25", today: "2026-12-10" })).earlyBirdInr).toBeNull();
  });
});

describe("payment rows by terms", () => {
  const dates = { eventStart: "2027-01-20", eventEnd: "2027-01-22" };
  it("100/0 is one pre-fest row", () => {
    expect(paymentRowsByTerms({ terms: "100_0", cashInr: 100_000, ...dates })).toEqual([
      { phase: "pre_fest", amountInr: 100_000, dueOn: "2027-01-13", note: "Pre-fest instalment (100% before the fest)" },
    ]);
  });
  it("75/25 and 50/50 split the cash and always add up", () => {
    const a = paymentRowsByTerms({ terms: "75_25", cashInr: 100_001, ...dates });
    expect(a.map((r) => r.amountInr)).toEqual([75_001, 25_000]);
    expect(a[1]?.dueOn).toBe("2027-02-06");
    const b = paymentRowsByTerms({ terms: "50_50", cashInr: 100_000, ...dates });
    expect(b.map((r) => r.amountInr)).toEqual([50_000, 50_000]);
  });
  it("makes no rows for an all in-kind deal", () => {
    expect(paymentRowsByTerms({ terms: "75_25", cashInr: 0, ...dates })).toEqual([]);
  });
});

describe("follow-up sequence dates", () => {
  it("counts +5 and +10 business days", () => {
    const t = sequenceTasks("2026-12-07", [], { replied: false, company: "Acme" });
    expect(t.map((x) => x.dueOn)).toEqual(["2026-12-14", "2026-12-21"]);
  });
  it("skips holidays", () => {
    const t = sequenceTasks("2026-12-07", [{ day: "2026-12-09" }], { replied: false, company: "Acme" });
    expect(t.map((x) => x.dueOn)).toEqual(["2026-12-15", "2026-12-22"]);
  });
  it("creates nothing once the company replied, and DMs follow up in 3 business days", () => {
    expect(sequenceTasks("2026-12-07", [], { replied: true, company: "Acme" })).toEqual([]);
    expect(dmFollowUpDate("2026-12-09", [])).toBe("2026-12-14");
  });
});

describe("MoU", () => {
  const good: MouFields = {
    brandName: "Acme", officialAddress: "1 Main Rd", signatoryName: "Ravi", signatoryDesignation: "Director", tagline: "Fresh",
    deliverables: [{ name: "Banner", qty: 2 }], amountInr: 500_000, terms: "75_25", gstin: "22AAAAA0000A1Z5",
    mouDate: "2026-12-10", proformaDueDate: "2027-01-13",
  };
  it("accepts a complete form and checks the GSTIN format", () => {
    expect(validateMou(good)).toEqual({});
    expect(validateMou({ ...good, gstin: "BAD" }).gstin).toBeDefined();
    expect(validateMou({ ...good, deliverables: [] }).deliverables).toBeDefined();
    expect(validateMou({ ...good, proformaDueDate: "2026-12-01" }).proformaDueDate).toBeDefined();
  });
  it("renders the banner, the post-event report line and the delivery-window placeholder", () => {
    const m = renderMou(good, "Saarang");
    expect(m.banner).toBe(MOU_BANNER);
    const lines = m.sections.flatMap((s) => s.lines).join("\n");
    expect(lines).toContain("Post-event report");
    expect(lines).toContain(DELIVERY_WINDOW_PLACEHOLDER);
    expect(lines).toContain("2 x Banner");
  });
});

describe("creators", () => {
  it("normalises handles and builds the DM link", () => {
    expect(normaliseHandle("@Some.Name_1")).toBe("some.name_1");
    expect(normaliseHandle("https://www.instagram.com/foo/?hl=en")).toBe("foo");
    expect(normaliseHandle("bad handle!")).toBeNull();
    expect(dmUrl("foo")).toBe("https://ig.me/m/foo");
  });
  it("only moves forward through the DM flow", () => {
    expect(canMoveCreator("to_dm", "dm_sent")).toBe(true);
    expect(canMoveCreator("to_dm", "confirmed")).toBe(false);
    expect(canMoveCreator("replied", "confirmed")).toBe(true);
    expect(canMoveCreator("confirmed", "declined")).toBe(false);
  });
});