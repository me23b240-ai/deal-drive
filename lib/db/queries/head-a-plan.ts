import { requireHead } from "../guards";
import type { Ctx, TeamGoal, WarmthFunnelRow } from "../../types";
import { formatInr } from "../../domain/money";
import type { ProjectionResult } from "../../model/projection";
import { getGateReport, getPlanModel, type GateReport, type PlanModel } from "./plan";
import { getTeamGoals } from "./settings";
import { getWarmthFunnel } from "./views";

export const MIN_OBSERVED_N = 30;

export type ModelRow = {
  key: string;
  label: string;
  unit: "count" | "deals" | "inr" | "pct";
  floor: number;
  base: number;
  stretch: number;
};

export type ObservedRow = {
  segment: "warm" | "other";
  metric: string;
  base: number;
  stretch: number;
  observed: number | null;
  n: number;
  outreached: number;
  enough: boolean;
};

export type PlanView = {
  model: PlanModel;
  rows: ModelRow[];
  example: string[];
  observed: ObservedRow[];
  gates: GateReport;
  goals: { base: TeamGoal | null; stretch: TeamGoal | null };
};

const pct = (x: number): string => `${Math.round(x * 1000) / 10}%`;

export function buildModelRows(model: PlanModel): ModelRow[] {
  const { settings: s, state: st, projection: p } = model;
  const seg = (leads: number, r: { response: number; proposalRate: number }) => ({
    conv: leads * r.response,
    prop: leads * r.response * r.proposalRate,
  });
  const bw = seg(st.queueWarm, s.base.warm);
  const bo = seg(st.queueOther, s.base.other);
  const sw = seg(s.stretchWarmLeads, s.stretch.warm);
  const so = seg(s.stretchOtherLeads, s.stretch.other);
  const eff = (r: ProjectionResult): number =>
    r.signed > 0 && s.prefestShare > 0 ? 1 - r.cashBeforeFest / (r.signed * s.prefestShare) : 0;
  const row = (key: string, label: string, unit: ModelRow["unit"], floor: number, base: number, stretch: number): ModelRow => ({
    key,
    label,
    unit,
    floor,
    base,
    stretch,
  });
  return [
    row("new_warm", "New outreach: warm leads", "count", 0, st.queueWarm, s.stretchWarmLeads),
    row("new_other", "New outreach: other leads", "count", 0, st.queueOther, s.stretchOtherLeads),
    row("conversations", "Conversations (responses)", "count", 0, bw.conv + bo.conv, sw.conv + so.conv),
    row("proposals", "Proposals (prospective or better)", "count", 0, bw.prop + bo.prop, sw.prop + so.prop),
    row("new_deals", "New signed deals", "deals", 0, p.base.newDeals, p.stretch.newDeals),
    row("open_closes", "Open-prospect closes", "deals", 0, p.base.openDeals, p.stretch.openDeals),
    row("total_deals", "Total signed deals", "deals", st.signedDealsToDate, p.base.totalDeals, p.stretch.totalDeals),
    row("total_signed", "Total signed amount", "inr", st.signedToDate, p.base.signed, p.stretch.signed),
    row("inkind", "In-kind share (effective)", "pct", st.observedInkindShare, eff(p.base), eff(p.stretch)),
    row("cash", "Cash before fest", "inr", p.floor, p.base.cashBeforeFest, p.stretch.cashBeforeFest),
  ];
}

export function workedExample(model: PlanModel): string[] {
  const { settings: s, state: st, projection: p } = model;
  const line = (name: string, r: ProjectionResult, closeRate: number, inkind: number): string[] => [
    `${name} signed = ${formatInr(st.signedToDate)} signed + ${formatInr(st.openProspectInr)} x ${pct(closeRate)} open-prospect close + ${r.newDeals.toFixed(2)} new deals x ${formatInr(s.avgNewDeal)} = ${formatInr(r.signed)}`,
    `${name} cash before fest = ${formatInr(r.signed)} x (1 - ${pct(inkind)} in-kind) x ${pct(s.prefestShare)} pre-fest = ${formatInr(r.cashBeforeFest)}`,
  ];
  const out = [
    ...line("Base", p.base, s.base.closeRate, s.base.inkindShare),
    ...line("Stretch", p.stretch, s.stretch.closeRate, s.stretch.inkindShare),
    `Floor cash = ${formatInr(st.signedToDate)} x (1 - ${pct(st.observedInkindShare)} observed in-kind) x ${pct(s.prefestShare)} pre-fest = ${formatInr(p.floor)}`,
  ];
  if (s.inkindScope === "new_only") {
    out.push("In-kind policy is new_only: existing signed keeps its observed in-kind share, so the cash lines above are approximate.");
  }
  return out;
}

export function observedRows(model: PlanModel, warmth: WarmthFunnelRow[]): ObservedRow[] {
  const out: ObservedRow[] = [];
  for (const seg of ["warm", "other"] as const) {
    const w = warmth.find((r) => r.warmth === seg);
    const o = Number(w?.outreached ?? 0);
    const r = Number(w?.responded ?? 0);
    const p = Number(w?.prospective_or_better ?? 0);
    const c = Number(w?.converted ?? 0);
    const b = model.settings.base[seg];
    const t = model.settings.stretch[seg];
    const mk = (metric: string, base: number, stretch: number, top: number, den: number): ObservedRow => ({
      segment: seg,
      metric,
      base,
      stretch,
      observed: den > 0 ? top / den : null,
      n: den,
      outreached: o,
      enough: o >= MIN_OBSERVED_N,
    });
    out.push(
      mk("Response rate (responded / outreached)", b.response, t.response, r, o),
      mk("Proposal rate (prospective or better / responded)", b.proposalRate, t.proposalRate, p, r),
      mk("Sign rate (converted / prospective or better)", b.signRate, t.signRate, c, p),
    );
  }
  return out;
}

export async function getPlanView(ctx: Ctx): Promise<PlanView> {
  requireHead(ctx);
  const [model, gates, goals, warmth] = await Promise.all([
    getPlanModel(ctx),
    getGateReport(ctx),
    getTeamGoals(ctx),
    getWarmthFunnel(ctx),
  ]);
  return {
    model,
    rows: buildModelRows(model),
    example: workedExample(model),
    observed: observedRows(model, warmth),
    gates,
    goals,
  };
}