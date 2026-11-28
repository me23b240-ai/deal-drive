import { describe, expect, it } from "vitest";
import { legalNextStatuses } from "@/lib/domain/crm-rules";
import { dealTotals, defaultProformaDue } from "@/lib/domain/mou-flow";

describe("mou flow helpers", () => {
  it("totals a slab with in-kind and a discount line", () => {
    const t = dealTotals([
      { category: "Package", qty: 1, unitPriceInr: 600_000, inKind: false },
      { category: "Custom", qty: 2, unitPriceInr: 10_000, inKind: true },
      { category: "Discount", qty: 1, unitPriceInr: 20_000, inKind: false },
    ]);
    expect(t).toEqual({ count: 2, totalInr: 600_000, inKindInr: 20_000, cashInr: 580_000, discountInr: 20_000 });
  });
  it("puts the proforma due date a week before the fest, never before the MoU date", () => {
    expect(defaultProformaDue("2027-01-20", "2026-12-10")).toBe("2027-01-13");
    expect(defaultProformaDue("2027-01-20", "2027-01-18")).toBe("2027-01-18");
  });
  it("no longer offers Converted in the status dropdown", () => {
    expect(legalNextStatuses("prospective")).not.toContain("converted");
    expect(legalNextStatuses("prospective")).toContain("rejected");
  });
});