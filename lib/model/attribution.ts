import { DEFAULT_SETTINGS, floorCash, project, scenarioInput, type ModelSettings, type PlanState } from "./projection";

export type AttributionRow = { bet: string; label: string; cashOverFloor: number };

export type Attribution = {
  rows: AttributionRow[];
  floor: number;
  stretchCash: number;
  sumOverFloor: number;
  reconciles: boolean;
};

export function emptyAttribution(): AttributionRow[] {
  return [];
}

/**
 * Cash over the floor in the stretch case, per bet.
 * bet-1: open prospects closed. bet-3 (offer design): cash-first terms plus the packaging uplift on new deals.
 * The remaining warm cash is split by warmSplit into bet-2 (network) and bet-4 (referral). bet-5: the rest of the other-lead cash.
 */
export function attributeStretch(state: PlanState, settings: ModelSettings = DEFAULT_SETTINGS): Attribution {
  const input = scenarioInput(state, "stretch", settings);
  const res = project(input);
  const obs = state.observedInkindShare;
  const p = settings.prefestShare;
  const st = settings.stretch;
  const avg = settings.avgNewDeal;
  const keep = 1 - obs;
  const perLead = (r: { response: number; proposalRate: number; signRate: number }) => r.response * r.proposalRate * r.signRate;

  const bet1 = state.openProspectInr * st.closeRate * keep * p;
  const inkindBase = settings.inkindScope === "all" ? res.signed : res.signed - state.signedToDate;
  const cashFirst = inkindBase * (obs - st.inkindShare) * p;
  const packaging = avg > 0 ? Math.min(1, Math.max(0, 1 - settings.baselineAvgDeal / avg)) : 0;
  const warmCash = settings.stretchWarmLeads * perLead(st.warm) * avg * keep * p;
  const otherCash = settings.stretchOtherLeads * perLead(st.other) * avg * keep * p;

  const bet3 = cashFirst + packaging * (warmCash + otherCash);
  const warmLeft = warmCash * (1 - packaging);
  const split = settings.warmSplit.network + settings.warmSplit.referral;
  const networkShare = split > 0 ? settings.warmSplit.network / split : 1;
  const bet2 = warmLeft * networkShare;
  const bet4 = warmLeft - bet2;
  const bet5 = otherCash * (1 - packaging);

  const rows: AttributionRow[] = [
    { bet: "bet-1", label: "Deal desk + MoU in minutes", cashOverFloor: Math.round(bet1) },
    { bet: "bet-2", label: "Warm network engine", cashOverFloor: Math.round(bet2) },
    { bet: "bet-3", label: "Offer design", cashOverFloor: Math.round(bet3) },
    { bet: "bet-4", label: "Referral and intro magnet", cashOverFloor: Math.round(bet4) },
    { bet: "bet-5", label: "Lead engine + capped cold/signal test", cashOverFloor: Math.round(bet5) },
  ];
  const sum = rows.reduce((t, r) => t + r.cashOverFloor, 0);
  const floor = floorCash(input);
  return { rows, floor, stretchCash: res.cashBeforeFest, sumOverFloor: sum, reconciles: Math.abs(floor + sum - res.cashBeforeFest) <= 1000 };
}