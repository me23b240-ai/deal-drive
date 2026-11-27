import { requireHead } from "../guards";
import type { Ctx } from "../../types";
import { toIstDate } from "../../domain/bizdays";
import { attributeStretch, type Attribution } from "../../model/attribution";
import {
  closingOnlyPhase,
  gateStatuses,
  missedBaseGate,
  paceLine,
  signedAsOf,
  type Gate,
  type GateStatus,
  type PacePoint,
} from "../../model/gates";
import { PLAN_END, PLAN_START, buildPlanState, leadSupply, type BrandRow, type LeadSupply, type SignedDeal } from "../../model/derive";
import { DEFAULT_SETTINGS, mergeSettings, projectPlan, type ModelSettings, type PlanProjection, type PlanState } from "../../model/projection";
import { fetchAll, num } from "./page";

type SettingsPatch = Parameters<typeof mergeSettings>[0];

/** Plan settings live in events.model_assumptions.plan (same shape as ModelSettings, every field optional). */
export function getPlanSettings(ctx: Ctx, patch: SettingsPatch = {}): ModelSettings {
  const stored = ctx.event.model_assumptions.plan;
  const base = stored && typeof stored === "object" ? mergeSettings(stored as SettingsPatch, DEFAULT_SETTINGS) : DEFAULT_SETTINGS;
  return mergeSettings(patch, base);
}

export async function getBrandRows(ctx: Ctx): Promise<BrandRow[]> {
  const rows = await fetchAll<Record<string, unknown>>(
    "brands",
    "id, name, owner_id, crm_status, source_channel, approx_amount_inr, first_outreach_at, last_touch_at, next_follow_up, initiative_id",
    { event_id: ctx.eventId },
  );
  return rows
    .filter((r) => r.crm_status !== null)
    .map((r) => ({
      id: String(r.id),
      name: String(r.name),
      owner_id: (r.owner_id as string | null) ?? null,
      crm_status: (r.crm_status as string | null) ?? null,
      source_channel: (r.source_channel as string | null) ?? null,
      approx_amount_inr: num(r.approx_amount_inr),
      first_outreach_at: (r.first_outreach_at as string | null) ?? null,
      last_touch_at: (r.last_touch_at as string | null) ?? null,
      next_follow_up: (r.next_follow_up as string | null) ?? null,
      initiative_id: (r.initiative_id as string | null) ?? null,
    }));
}

/** Confirmed deals. The confirmation date is the MoU date, else the day the stage changed. */
export async function getSignedDeals(ctx: Ctx): Promise<SignedDeal[]> {
  const rows = await fetchAll<Record<string, unknown>>(
    "deals",
    "id, brand_id, signed_value_inr, signed_cash_inr, signed_in_kind_inr, mou_signed_at, stage_changed_at, created_at",
    { event_id: ctx.eventId, stage: "partner_confirmed" },
  );
  return rows.map((r) => ({
    dealId: String(r.id),
    brandId: String(r.brand_id),
    amountInr: num(r.signed_value_inr),
    cashInr: num(r.signed_cash_inr),
    inKindInr: num(r.signed_in_kind_inr),
    confirmedOn: r.mou_signed_at ? String(r.mou_signed_at) : toIstDate(String(r.stage_changed_at ?? r.created_at)),
  }));
}

export async function getPlanState(ctx: Ctx): Promise<PlanState> {
  requireHead(ctx);
  const [brands, signed] = await Promise.all([getBrandRows(ctx), getSignedDeals(ctx)]);
  return buildPlanState(brands, signed);
}

export type PlanModel = {
  settings: ModelSettings;
  state: PlanState;
  projection: PlanProjection;
  attribution: Attribution;
  leadSupply: LeadSupply;
  planStart: string;
  planEnd: string;
};

/** Everything the Plan tab needs. Pass a patch for what-if runs (chatbot run_projection). */
export async function getPlanModel(ctx: Ctx, patch: SettingsPatch = {}): Promise<PlanModel> {
  requireHead(ctx);
  const [brands, signed] = await Promise.all([getBrandRows(ctx), getSignedDeals(ctx)]);
  const settings = getPlanSettings(ctx, patch);
  const state = buildPlanState(brands, signed);
  return {
    settings,
    state,
    projection: projectPlan(state, settings),
    attribution: attributeStretch(state, settings),
    leadSupply: leadSupply(brands, settings),
    planStart: PLAN_START,
    planEnd: PLAN_END,
  };
}

export async function getGates(ctx: Ctx): Promise<Gate[]> {
  const rows = await fetchAll<Record<string, unknown>>("portfolio_gates", "gate_date, base_signed_inr, stretch_signed_inr", { event_id: ctx.eventId });
  return rows
    .map((r) => ({ gateOn: String(r.gate_date), baseInr: num(r.base_signed_inr), stretchInr: num(r.stretch_signed_inr) }))
    .sort((a, b) => a.gateOn.localeCompare(b.gateOn));
}

export type GateReport = {
  statuses: GateStatus[];
  closingOnly: boolean;
  missed: GateStatus | null;
  pace: PacePoint[];
  actualToday: number;
  signedByDay: { date: string; cumulativeInr: number }[];
};

export async function getGateReport(ctx: Ctx): Promise<GateReport> {
  requireHead(ctx);
  const [gates, signed, model] = await Promise.all([getGates(ctx), getSignedDeals(ctx), getPlanModel(ctx)]);
  const deals = signed.map((d) => ({ confirmedOn: d.confirmedOn, amountInr: d.amountInr }));
  const statuses = gateStatuses(gates, deals, ctx.todayIst);
  const actualToday = signedAsOf(deals, ctx.todayIst);
  const days = [...new Set(deals.map((d) => d.confirmedOn))].sort();
  return {
    statuses,
    closingOnly: closingOnlyPhase(gates, ctx.todayIst),
    missed: missedBaseGate(statuses),
    pace: paceLine(gates, ctx.todayIst, actualToday, PLAN_END, model.projection.base.signed, model.projection.stretch.signed),
    actualToday,
    signedByDay: days.map((date) => ({ date, cumulativeInr: signedAsOf(deals, date) })),
  };
}

export async function getLeadSupply(ctx: Ctx): Promise<LeadSupply> {
  requireHead(ctx);
  return leadSupply(await getBrandRows(ctx), getPlanSettings(ctx));
}