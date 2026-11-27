import { getServiceClient } from "../client";
import { NotFoundError, ValidationError } from "../errors";
import { assertWritable, requireHead } from "../guards";
import type { Ctx } from "../../types";
import { fetchAll, num } from "./page";

type Row = Record<string, unknown>;

export const WORK_EVENT = "campusfest-2025-work";
const FIXED_STAGES = ["prospecting", "proposal_sent", "negotiating", "partner_confirmed", "lost"];

export type QualRow = { brandId: string; name: string; status: string };
export type OppRow = { id: string; name: string; stage: string; supportType: string; proposedInr: number; signedInr: number };

/** Latest qualification status per brand, using versions up to the event as_of. */
export async function getQualRows(ctx: Ctx): Promise<QualRow[]> {
  const brands = await fetchAll<Row>("brands", "id, name", { event_id: ctx.eventId });
  const supabase = getServiceClient();
  const asOf = ctx.event.as_of ? Date.parse(ctx.event.as_of) : null;
  const latest = new Map<string, { status: string; at: number }>();
  const ids = brands.map((b) => String(b.id));
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from("qualification_history")
      .select("brand_id, status, effective_at")
      .in("brand_id", ids.slice(i, i + 100));
    if (error) throw new Error(`qualification_history: ${error.message}`);
    for (const r of (data ?? []) as Row[]) {
      const at = Date.parse(String(r.effective_at));
      if (asOf !== null && at > asOf) continue;
      const key = String(r.brand_id);
      const cur = latest.get(key);
      if (!cur || at >= cur.at) latest.set(key, { status: String(r.status), at });
    }
  }
  return brands
    .map((b) => ({ brandId: String(b.id), name: String(b.name), status: latest.get(String(b.id))?.status ?? "none" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type DataLabData = {
  opportunities: OppRow[];
  stages: string[];
  qual: QualRow[];
  qualStatuses: string[];
};

export async function getDataLab(ctx: Ctx): Promise<DataLabData> {
  requireHead(ctx);
  const [deals, qual] = await Promise.all([
    fetchAll<Row>("deals", "id, name, stage, support_type, proposed_value_inr, signed_value_inr", { event_id: ctx.eventId }),
    getQualRows(ctx),
  ]);
  const opportunities = deals
    .map((d): OppRow => ({
      id: String(d.id),
      name: String(d.name ?? "Opportunity"),
      stage: String(d.stage),
      supportType: String(d.support_type ?? "cash"),
      proposedInr: num(d.proposed_value_inr),
      signedInr: num(d.signed_value_inr),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    opportunities,
    stages: [...new Set([...FIXED_STAGES, ...opportunities.map((o) => o.stage)])],
    qual,
    qualStatuses: [...new Set(qual.map((q) => q.status).filter((s) => s !== "none"))].sort(),
  };
}

function guard(ctx: Ctx): void {
  requireHead(ctx);
  assertWritable(ctx);
  if (ctx.eventId !== WORK_EVENT) throw new ValidationError("Data lab edits are only allowed on the CampusFest working copy.");
}

export async function editOpportunity(
  ctx: Ctx,
  id: string,
  patch: { stage?: string | undefined; proposedInr?: number | undefined; signedInr?: number | undefined },
): Promise<void> {
  guard(ctx);
  const supabase = getServiceClient();
  const found = await supabase.from("deals").select("id, stage, support_type").eq("id", id).eq("event_id", ctx.eventId).maybeSingle();
  if (found.error) throw new Error(`deals: ${found.error.message}`);
  if (!found.data) throw new NotFoundError("Opportunity not found.");
  const update: Row = {};
  if (patch.stage !== undefined && patch.stage !== String(found.data.stage)) {
    update.stage = patch.stage;
    update.stage_changed_at = new Date().toISOString();
  }
  if (patch.proposedInr !== undefined) update.proposed_value_inr = Math.round(patch.proposedInr);
  if (patch.signedInr !== undefined) {
    const v = Math.round(patch.signedInr);
    const inKind = String(found.data.support_type) === "in_kind";
    update.signed_value_inr = v;
    update.signed_cash_inr = inKind ? 0 : v;
    update.signed_in_kind_inr = inKind ? v : 0;
  }
  if (Object.keys(update).length === 0) throw new ValidationError("Nothing to update.");
  const res = await supabase.from("deals").update(update).eq("id", id);
  if (res.error) throw new Error(`deals: ${res.error.message}`);
}

export async function editQualification(ctx: Ctx, brandId: string, status: string): Promise<void> {
  guard(ctx);
  const supabase = getServiceClient();
  const brand = await supabase.from("brands").select("id").eq("id", brandId).eq("event_id", ctx.eventId).maybeSingle();
  if (brand.error) throw new Error(`brands: ${brand.error.message}`);
  if (!brand.data) throw new NotFoundError("Brand not found.");
  const prev = await supabase
    .from("qualification_history")
    .select("campaign_id")
    .eq("brand_id", brandId)
    .order("effective_at", { ascending: false })
    .limit(1);
  if (prev.error) throw new Error(`qualification_history: ${prev.error.message}`);
  const res = await supabase.from("qualification_history").insert({
    brand_id: brandId,
    campaign_id: prev.data?.[0]?.campaign_id ?? null,
    status,
    reason: "Edited in Data lab",
    effective_at: ctx.event.as_of ?? new Date().toISOString(),
  });
  if (res.error) throw new Error(`qualification_history: ${res.error.message}`);
}