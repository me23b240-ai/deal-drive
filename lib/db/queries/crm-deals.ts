import { getServiceClient } from "@/lib/db/client";
import { assertWritable } from "@/lib/db/guards";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/db/errors";
import type { Ctx, DealDeskRow } from "@/lib/types";
import { getDealDesk } from "./views";

export const OPEN_DEAL_STAGES = ["prospecting", "proposal_sent", "negotiating", "mou_sent"] as const;
export type OpenDealStage = (typeof OPEN_DEAL_STAGES)[number];

/** Coordinators see their own open deals; closers see every open deal. */
export async function listOpenDeals(ctx: Ctx): Promise<DealDeskRow[]> {
  return getDealDesk(ctx);
}

async function loadDeal(ctx: Ctx, dealId: string): Promise<{ id: string; brandId: string; stage: string }> {
  const { data, error } = await getServiceClient().from("deals").select("id, event_id, owner_id, brand_id, stage").eq("id", dealId).maybeSingle();
  if (error) throw new Error(`deals: ${error.message}`);
  if (!data || data.event_id !== ctx.eventId) throw new NotFoundError("Deal not found.");
  if (ctx.role === "coordinator" && !ctx.isCloser && data.owner_id !== ctx.memberId) throw new ForbiddenError("This deal belongs to another coordinator.");
  if (!(OPEN_DEAL_STAGES as readonly string[]).includes(String(data.stage))) throw new ValidationError("This deal is already closed.");
  return { id: String(data.id), brandId: String(data.brand_id), stage: String(data.stage) };
}

/** Closing a deal goes through the company status (Converted or Rejected), so only open stages are editable here. */
export async function updateDeal(ctx: Ctx, dealId: string, patch: { stage?: OpenDealStage; nextFollowUp?: string | null }): Promise<void> {
  assertWritable(ctx);
  const deal = await loadDeal(ctx, dealId);
  const supabase = getServiceClient();
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {};
  if (patch.stage && patch.stage !== deal.stage) {
    update.stage = patch.stage;
    update.stage_changed_at = now;
  }
  if (patch.nextFollowUp !== undefined) update.next_follow_up = patch.nextFollowUp;
  if (Object.keys(update).length === 0) return;
  const { error } = await supabase.from("deals").update(update).eq("id", deal.id);
  if (error) throw new Error(`deals: ${error.message}`);
  const brandPatch: Record<string, unknown> = {};
  if (update.stage) brandPatch.last_touch_at = now;
  if (patch.nextFollowUp !== undefined) brandPatch.next_follow_up = patch.nextFollowUp;
  const { error: bErr } = await supabase.from("brands").update(brandPatch).eq("id", deal.brandId);
  if (bErr) throw new Error(`brands: ${bErr.message}`);
}

/** One nudge: logs a follow-up activity and resets the idle clock. */
export async function nudgeDeal(ctx: Ctx, dealId: string): Promise<void> {
  assertWritable(ctx);
  const deal = await loadDeal(ctx, dealId);
  const supabase = getServiceClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("activities").insert({
    event_id: ctx.eventId,
    brand_id: deal.brandId,
    owner_id: ctx.memberId,
    event_type: "follow_up",
    summary: "Nudge sent from the deal desk",
    occurred_at: now,
  });
  if (error) throw new Error(`activities: ${error.message}`);
  const { error: bErr } = await supabase.from("brands").update({ last_touch_at: now }).eq("id", deal.brandId);
  if (bErr) throw new Error(`brands: ${bErr.message}`);
}