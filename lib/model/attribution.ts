import { DEFAULT_SETTINGS, floorCash, project, scenarioInput, segmentDeals, type ModelSettings, type PlanState } from "./projection";

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
  const bet2 = inkindBase * (obs - st.inkindShare) * p;
  const bet3Leads = Math.max(0, settings.stretchWarmLeads - settings.artistLeads);
  const bet3 = bet3Leads * perLead(st.warm) * avg * keep * p;
  const bet4 = settings.artistLeads * perLead(st.warm) * avg * keep * p;
  const bet5 = segmentDeals({ leads: settings.stretchOtherLeads, ...st.other }) * avg * keep * p;

  const rows: AttributionRow[] = [
    { bet: "bet-1", label: "Deal desk", cashOverFloor: Math.round(bet1) },
    { bet: "bet-2", label: "Cash-first terms", cashOverFloor: Math.round(bet2) },
    { bet: "bet-3", label: "Warm renewals", cashOverFloor: Math.round(bet3) },
    { bet: "bet-4", label: "Lineup-triggered pitch", cashOverFloor: Math.round(bet4) },
    { bet: "bet-5", label: "Capped cold test", cashOverFloor: Math.round(bet5) },
  ];
  const sum = rows.reduce((t, r) => t + r.cashOverFloor, 0);
  const floor = floorCash(input);
  return { rows, floor, stretchCash: res.cashBeforeFest, sumOverFloor: sum, reconciles: Math.abs(floor + sum - res.cashBeforeFest) <= 1000 };
}