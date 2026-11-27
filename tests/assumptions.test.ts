import { describe, expect, it } from "vitest";
import { DEFAULT_ASSUMPTIONS, resolveAssumptions } from "@/lib/model/assumptions";

describe("assumptions", () => {
  it("returns defaults for empty input", () => {
    expect(resolveAssumptions({})).toEqual(DEFAULT_ASSUMPTIONS);
    expect(resolveAssumptions(null)).toEqual(DEFAULT_ASSUMPTIONS);
  });

  it("merges partial overrides deeply", () => {
    const r = resolveAssumptions({ close_rate: { stretch: 0.5 }, avg_new_deal_inr: 100000 });
    expect(r.close_rate.base).toBe(0.25);
    expect(r.close_rate.stretch).toBe(0.5);
    expect(r.avg_new_deal_inr).toBe(100000);
  });

  it("ignores values of the wrong type", () => {
    const r = resolveAssumptions({ avg_new_deal_inr: "x", inkind_policy_scope: "nope" });
    expect(r.avg_new_deal_inr).toBe(125000);
    expect(r.inkind_policy_scope).toBe("all");
  });
});