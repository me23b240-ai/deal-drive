import { getServiceClient } from "../client";
import { ValidationError } from "../errors";
import { assertWritable, requireHead } from "../guards";
import type { Ctx } from "../../types";
import { buildScenarios, observedPrefest, type PrefestObserved, type ScenarioRow } from "../../model/scenarios";
import { getV2Signals } from "./head-a-signals";
import { fetchAll, num } from "./page";
import { getPlanModel } from "./plan";
import { getAssumptions } from "./settings";

export const UPSIDE_TRIGGER = 25;

export type ScenarioView = {
  rows: ScenarioRow[];
  prefest: PrefestObserved & { assumed: number };
  moonshot: boolean;
  extraQualified: number;
  byDate: string;
  extras: { discountPct: number; deadline: string; sectors: string[] };
};

export async function getScenarioView(ctx: Ctx): Promise<ScenarioView> {
  requireHead(ctx);
  const [model, deals, v2] = await Promise.all([
    getPlanModel(ctx),
    fetchAll<Record<string, unknown>>("deals", "signed_cash_inr, payment_terms", { event_id: ctx.eventId, stage: "partner_confirmed" }),
    getV2Signals(ctx),
  ]);
  const a = getAssumptions(ctx);
  return {
    rows: buildScenarios(model.state, model.settings),
    prefest: { ...observedPrefest(deals.map((d) => ({ cashInr: num(d.signed_cash_inr), terms: (d.payment_terms as string | null) ?? null }))), assumed: model.settings.prefestShare },
    moonshot: v2.upside.extraQualified >= UPSIDE_TRIGGER && v2.upside.today <= v2.upside.byDate,
    extraQualified: v2.upside.extraQualified,
    byDate: v2.upside.byDate,
    extras: { discountPct: Math.round(a.early_bird_discount * 10000) / 100, deadline: a.early_bird_deadline, sectors: a.exclusive_sectors },
  };
}

export async function saveExtras(ctx: Ctx, x: { discountPct: number; deadline: string; sectors: string[] }): Promise<void> {
  requireHead(ctx);
  assertWritable(ctx);
  if (x.discountPct < 0 || x.discountPct > 30) throw new ValidationError("The early-bird discount must be between 0 and 30 percent.");
  const sb = getServiceClient();
  const found = await sb.from("events").select("model_assumptions").eq("id", ctx.eventId).maybeSingle();
  if (found.error) throw new Error(`events: ${found.error.message}`);
  const raw = found.data?.model_assumptions;
  const cur = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const sectors = [...new Set(x.sectors.map((s) => s.trim().toLowerCase()).filter(Boolean))];
  const res = await sb
    .from("events")
    .update({ model_assumptions: { ...cur, early_bird_discount: x.discountPct / 100, early_bird_deadline: x.deadline, exclusive_sectors: sectors } })
    .eq("id", ctx.eventId);
  if (res.error) throw new Error(`events: ${res.error.message}`);
}