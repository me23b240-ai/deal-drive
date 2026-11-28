import { describe, expect, it } from "vitest";
import { isPaymentTerms, paymentSplit, prefestShareFor } from "@/lib/domain/payments";

describe("payment terms", () => {
  it("maps terms to the pre-fest share", () => {
    expect(prefestShareFor("100_0")).toBe(1);
    expect(prefestShareFor("75_25")).toBe(0.75);
    expect(prefestShareFor("50_50")).toBe(0.5);
    expect(prefestShareFor(null)).toBe(0.75);
    expect(prefestShareFor("weird")).toBe(0.75);
  });
  it("splits the cash portion for each terms value", () => {
    expect(paymentSplit(240_000, "75_25")).toEqual({ share: 0.75, pre: 180_000, post: 60_000 });
    expect(paymentSplit(240_000, "50_50")).toEqual({ share: 0.5, pre: 120_000, post: 120_000 });
    expect(paymentSplit(240_000, "100_0")).toEqual({ share: 1, pre: 240_000, post: 0 });
  });
  it("always adds up to the cash amount", () => {
    for (const t of ["100_0", "75_25", "50_50"]) {
      const s = paymentSplit(100_001, t);
      expect(s.pre + s.post).toBe(100_001);
    }
  });
  it("matches the seeded Saarang payments", () => {
    const cash = [200_000, 240_000, 450_000, 100_000];
    expect(cash.reduce((t, c) => t + paymentSplit(c, "75_25").pre, 0)).toBe(742_500);
    expect(cash.reduce((t, c) => t + paymentSplit(c, "75_25").post, 0)).toBe(247_500);
  });
  it("validates terms", () => {
    expect(isPaymentTerms("50_50")).toBe(true);
    expect(isPaymentTerms("60_40")).toBe(false);
  });
});