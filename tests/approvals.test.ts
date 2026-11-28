import { describe, expect, it } from "vitest";
import { IN_KIND_LIMIT, approvalReasons } from "@/lib/domain/approvals";

const base = { paymentTerms: "75_25", proposedInr: 500_000, inKindInr: 0, catalogFloorInr: null };

describe("approval rules", () => {
  it("needs no approval for plain 75/25 terms", () => {
    expect(approvalReasons(base)).toEqual([]);
    expect(approvalReasons({ ...base, paymentTerms: "100_0" })).toEqual([]);
  });
  it("flags 50/50 terms", () => {
    expect(approvalReasons({ ...base, paymentTerms: "50_50" })).toEqual(["terms_50_50"]);
  });
  it("flags in-kind above 5 percent but not at 5 percent", () => {
    expect(IN_KIND_LIMIT).toBe(0.05);
    expect(approvalReasons({ ...base, inKindInr: 25_000 })).toEqual([]);
    expect(approvalReasons({ ...base, inKindInr: 25_001 })).toEqual(["in_kind_over_5"]);
  });
  it("flags a price below the catalog minimum sum", () => {
    expect(approvalReasons({ ...base, catalogFloorInr: 600_000 })).toEqual(["price_below_catalog"]);
    expect(approvalReasons({ ...base, catalogFloorInr: 500_000 })).toEqual([]);
    expect(approvalReasons({ ...base, catalogFloorInr: 0 })).toEqual([]);
  });
  it("returns every reason that applies", () => {
    expect(approvalReasons({ paymentTerms: "50_50", proposedInr: 400_000, inKindInr: 100_000, catalogFloorInr: 450_000 })).toEqual(["terms_50_50", "in_kind_over_5", "price_below_catalog"]);
  });
  it("ignores in-kind when the deal has no amount", () => {
    expect(approvalReasons({ ...base, proposedInr: 0, inKindInr: 10 })).toEqual([]);
  });
});