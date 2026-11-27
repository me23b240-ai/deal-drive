import { getServiceClient } from "@/lib/db/client";
import { requireHead, scopeOwner } from "@/lib/db/guards";
import type {
  CashSummaryRow,
  ChannelFunnelRow,
  CoordSummaryRow,
  Ctx,
  DealDeskRow,
  InitiativeFunnelRow,
  NeedsUpdateRow,
  WarmthFunnelRow,
  WeeklyProgressRow,
} from "@/lib/types";

async function viewRows<T>(view: string, eventId: string, ownerId: string | null): Promise<T[]> {
  const supabase = getServiceClient();
  let query = supabase.from(view).select("*").eq("event_id", eventId);
  if (ownerId) query = query.eq("owner_id", ownerId);
  const { data, error } = await query;
  if (error) throw new Error(`${view}: ${error.message}`);
  return (data ?? []) as T[];
}

/** Companies needing an update (business days), biggest amount at risk first. */
export async function getNeedsUpdate(ctx: Ctx, ownerId?: string | null): Promise<NeedsUpdateRow[]> {
  const owner = scopeOwner(ctx, ownerId);
  const rows = await viewRows<NeedsUpdateRow>("v_needs_update", ctx.eventId, owner);
  return rows.sort(
    (a, b) => (b.approx_amount_inr ?? 0) - (a.approx_amount_inr ?? 0) || b.idle_bdays - a.idle_bdays,
  );
}

export async function getWeeklyProgress(ctx: Ctx, ownerId?: string | null): Promise<WeeklyProgressRow[]> {
  return viewRows<WeeklyProgressRow>("v_weekly_progress", ctx.eventId, scopeOwner(ctx, ownerId));
}

export async function getCoordSummary(ctx: Ctx, ownerId?: string | null): Promise<CoordSummaryRow[]> {
  return viewRows<CoordSummaryRow>("v_coord_summary", ctx.eventId, scopeOwner(ctx, ownerId));
}

export async function getCashSummary(ctx: Ctx, ownerId?: string | null): Promise<CashSummaryRow[]> {
  return viewRows<CashSummaryRow>("v_cash_summary", ctx.eventId, scopeOwner(ctx, ownerId));
}

/** Closers see every open deal; other coordinators only their own; the head sees all. */
export async function getDealDesk(ctx: Ctx, ownerId?: string | null): Promise<DealDeskRow[]> {
  const owner = ctx.role === "coordinator" && ctx.isCloser ? (ownerId ?? null) : scopeOwner(ctx, ownerId);
  const rows = await viewRows<DealDeskRow>("v_deal_desk", ctx.eventId, owner);
  return rows.sort((a, b) => b.proposed_inr - a.proposed_inr);
}

/** Team-level views below are head only (they have no owner column). */
export async function getChannelFunnel(ctx: Ctx): Promise<ChannelFunnelRow[]> {
  requireHead(ctx);
  return viewRows<ChannelFunnelRow>("v_crm_funnel_by_channel", ctx.eventId, null);
}

export async function getInitiativeFunnel(ctx: Ctx): Promise<InitiativeFunnelRow[]> {
  requireHead(ctx);
  return viewRows<InitiativeFunnelRow>("v_initiative_funnel", ctx.eventId, null);
}

export async function getWarmthFunnel(ctx: Ctx): Promise<WarmthFunnelRow[]> {
  requireHead(ctx);
  return viewRows<WarmthFunnelRow>("v_warmth_funnel", ctx.eventId, null);
}