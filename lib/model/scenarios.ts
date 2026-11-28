import { prefestShareFor } from "../domain/payments";
import { mergeSettings, projectPlan, type ModelSettings, type PlanState } from "./projection";

/** Non-fest benchmark: warm lead-to-signed of 3.6 percent (response x proposal rate x sign rate). */
export const DOWNSIDE_WARM_RATE = 0.036;
export const UPSIDE_WARM_LEADS = 85;

export type ScenarioRow = { key: string; label: string; note: string; signed: number; cash: number; newDeals: number };

export function buildScenarios(state: PlanState, settings: ModelSettings): ScenarioRow[] {
  const run = (patch: Parameters<typeof mergeSettings>[0]) => projectPlan(state, mergeSettings(patch, settings));
  const base = projectPlan(state, settings);
  const w = settings.base.warm;
  const denom = w.response * w.signRate;
  const downside = run({ base: { warm: { proposalRate: denom > 0 ? DOWNSIDE_WARM_RATE / denom : 0 } } });
  const bundlesFail = run({ avgNewDeal: settings.baselineAvgDeal });
  const upside = run({ stretchWarmLeads: UPSIDE_WARM_LEADS });
  return [
    { key: "floor", label: "Floor", note: "No new activity", signed: state.signedToDate, cash: base.floor, newDeals: 0 },
    { key: "downside", label: "Downside", note: "Warm lead-to-signed 3.6% (non-fest B2B benchmark)", signed: downside.base.signed, cash: downside.base.cashBeforeFest, newDeals: downside.base.newDeals },
    { key: "bundles_fail", label: "Bundles fail", note: `Stretch with the average deal at ${settings.baselineAvgDeal}`, signed: bundlesFail.stretch.signed, cash: bundlesFail.stretch.cashBeforeFest, newDeals: bundlesFail.stretch.newDeals },
    { key: "base", label: "Base", note: "Live queue only", signed: base.base.signed, cash: base.base.cashBeforeFest, newDeals: base.base.newDeals },
    { key: "stretch", label: "Stretch", note: `${settings.stretchWarmLeads} warm and ${settings.stretchOtherLeads} other leads`, signed: base.stretch.signed, cash: base.stretch.cashBeforeFest, newDeals: base.stretch.newDeals },
    { key: "upside", label: "Upside", note: `Stretch with ${UPSIDE_WARM_LEADS} warm leads`, signed: upside.stretch.signed, cash: upside.stretch.cashBeforeFest, newDeals: upside.stretch.newDeals },
  ];
}

export type PrefestObserved = { observed: number | null; n: number; cashInr: number };

/** Share of signed cash due before the fest, weighted by each deal's payment terms. */
export function observedPrefest(deals: { cashInr: number; terms: string | null }[]): PrefestObserved {
  const cash = deals.reduce((t, d) => t + d.cashInr, 0);
  const pre = deals.reduce((t, d) => t + d.cashInr * prefestShareFor(d.terms), 0);
  return { observed: cash > 0 ? pre / cash : null, n: deals.length, cashInr: cash };
}