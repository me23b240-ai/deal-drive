import { describe, expect, it } from "vitest";
import { DOWNSIDE_WARM_RATE, buildScenarios, observedPrefest } from "@/lib/model/scenarios";
import { DEFAULT_SETTINGS, mergeSettings, type PlanState } from "@/lib/model/projection";

const S: PlanState = {
  signedToDate: 1_100_000, signedDealsToDate: 4, openProspectInr: 3_075_000, openProspectCount: 14,
  queueWarm: 25, queueOther: 42, observedInkindShare: 0.1,
};
const by = (rows: ReturnType<typeof buildScenarios>) => Object.fromEntries(rows.map((r) => [r.key, r]));
const near = (a: number | undefined, b: number, tol = 1) => expect(Math.abs((a ?? 0) - b)).toBeLessThanOrEqual(tol);

describe("scenarios", () => {
  const r = by(buildScenarios(S, DEFAULT_SETTINGS));
  it("lists the six scenarios in order", () => {
    expect(buildScenarios(S, DEFAULT_SETTINGS).map((x) => x.key)).toEqual(["floor", "downside", "bundles_fail", "base", "stretch", "upside"]);
  });
  it("floor, base and stretch match the plan", () => {
    expect(r.floor?.cash).toBe(742_500);
    expect(r.base?.cash).toBe(1_490_063);
    expect(r.stretch?.signed).toBe(3_507_500);
    expect(r.stretch?.cash).toBe(2_499_094);
  });
  it("bundles fail uses the 93,000 baseline average deal", () => {
    near(r.bundles_fail?.signed, 3_206_060);
    near(r.bundles_fail?.cash, 2_284_318);
  });
  it("upside uses 85 warm leads", () => {
    expect(r.upside?.signed).toBe(3_976_250);
    expect(r.upside?.cash).toBe(2_833_078);
  });
  it("downside forces warm lead-to-signed to 3.6 percent", () => {
    const w = mergeSettings({ base: { warm: { proposalRate: DOWNSIDE_WARM_RATE / 0.25 } } }).base.warm;
    near(w.response * w.proposalRate * w.signRate, DOWNSIDE_WARM_RATE, 1e-9);
    near(r.downside?.signed, 2_007_500);
    near(r.downside?.cash, 1_355_063);
  });
  it("orders the cases floor < downside < base < stretch < upside", () => {
    const c = (k: string) => r[k]?.cash ?? 0;
    expect(c("floor")).toBeLessThan(c("downside"));
    expect(c("downside")).toBeLessThan(c("base"));
    expect(c("base")).toBeLessThan(c("stretch"));
    expect(c("bundles_fail")).toBeLessThan(c("stretch"));
    expect(c("stretch")).toBeLessThan(c("upside"));
  });
});

describe("observed pre-fest share", () => {
  it("matches the seeded 75/25 deals", () => {
    const o = observedPrefest([{ cashInr: 200_000, terms: "75_25" }, { cashInr: 240_000, terms: "75_25" }, { cashInr: 450_000, terms: "75_25" }, { cashInr: 100_000, terms: "75_25" }]);
    expect(o.observed).toBeCloseTo(0.75, 9);
    expect(o.n).toBe(4);
  });
  it("weights by terms and handles no data", () => {
    expect(observedPrefest([{ cashInr: 100_000, terms: "100_0" }, { cashInr: 100_000, terms: "50_50" }]).observed).toBeCloseTo(0.75, 9);
    expect(observedPrefest([]).observed).toBeNull();
  });
});