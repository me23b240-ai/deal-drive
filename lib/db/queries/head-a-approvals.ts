import { getServiceClient } from "../client";
import { NotFoundError, ValidationError } from "../errors";
import { assertWritable, requireHead } from "../guards";
import type { Ctx } from "../../types";
import { businessDaysBetween, toIstDate } from "../../domain/bizdays";
import { approvalReasons, type ApprovalReason } from "../../domain/approvals";
import { getHolidays } from "./holidays";
import { fetchAll, num } from "./page";
import { listTeam } from "./team";

type Row = Record<string, unknown>;
const OPEN = ["prospecting", "proposal_sent", "negotiating", "mou_sent"];

export type ApprovalRow = {
  dealId: string;
  company: string;
  ownerName: string;
  stage: string;
  proposedInr: number;
  inKindInr: number;
  paymentTerms: string;
  reasons: ApprovalReason[];
  ageBdays: number;
};
export type ApprovalBoard = { pending: ApprovalRow[]; recent: { dealId: string; company: string; status: string; at: string | null }[] };

async function floors(dealIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (dealIds.length === 0) return out;
  const items = await fetchAll<Row>("deal_items", "deal_id, list_price_inr, is_custom", {});
  const ids = new Set(dealIds);
  for (const i of items) {
    const id = String(i.deal_id);
    if (!ids.has(id) || i.is_custom) continue;
    out.set(id, (out.get(id) ?? 0) + num(i.list_price_inr));
  }
  return out;
}

export async function getApprovalBoard(ctx: Ctx): Promise<ApprovalBoard> {
  requireHead(ctx);
  const [deals, brands, team, holidays] = await Promise.all([
    fetchAll<Row>("deals", "id, brand_id, owner_id, stage, proposed_value_inr, signed_in_kind_inr, payment_terms, terms_status, terms_approved_at, stage_changed_at", { event_id: ctx.eventId }),
    fetchAll<Row>("brands", "id, name, final_in_kind_inr", { event_id: ctx.eventId }),
    listTeam(ctx.eventId),
    getHolidays(ctx.eventId),
  ]);
  const name = new Map(brands.map((b) => [String(b.id), String(b.name)]));
  const owner = new Map(team.map((m) => [m.id, m.name]));
  const pendingDeals = deals.filter((d) => d.terms_status === "pending_approval");
  const floor = await floors(pendingDeals.map((d) => String(d.id)));

  const pending = pendingDeals
    .map((d): ApprovalRow => {
      const id = String(d.id);
      const proposed = num(d.proposed_value_inr);
      const inKind = num(d.signed_in_kind_inr);
      const at = d.stage_changed_at ? toIstDate(String(d.stage_changed_at)) : ctx.todayIst;
      return {
        dealId: id,
        company: name.get(String(d.brand_id)) ?? "Unknown",
        ownerName: owner.get(String(d.owner_id)) ?? "Unassigned",
        stage: String(d.stage),
        proposedInr: proposed,
        inKindInr: inKind,
        paymentTerms: String(d.payment_terms ?? "75_25"),
        reasons: approvalReasons({ paymentTerms: String(d.payment_terms ?? ""), proposedInr: proposed, inKindInr: inKind, catalogFloorInr: floor.get(id) ?? null }),
        ageBdays: businessDaysBetween(at, ctx.todayIst, holidays),
      };
    })
    .sort((a, b) => b.proposedInr - a.proposedInr);

  const recent = deals
    .filter((d) => d.terms_status === "approved" || d.terms_status === "rejected")
    .map((d) => ({ dealId: String(d.id), company: name.get(String(d.brand_id)) ?? "Unknown", status: String(d.terms_status), at: d.terms_approved_at ? String(d.terms_approved_at).slice(0, 10) : null }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 10);
  return { pending, recent };
}

async function loadDeal(ctx: Ctx, dealId: string): Promise<Row> {
  const { data, error } = await getServiceClient()
    .from("deals")
    .select("id, event_id, brand_id, owner_id, stage, proposed_value_inr, signed_in_kind_inr, payment_terms, terms_status")
    .eq("id", dealId)
    .maybeSingle();
  if (error) throw new Error(`deals: ${error.message}`);
  if (!data || data.event_id !== ctx.eventId) throw new NotFoundError("Deal not found.");
  return data as Row;
}

async function headId(ctx: Ctx): Promise<string | null> {
  return (await listTeam(ctx.eventId)).find((m) => m.role === "manager")?.id ?? null;
}

export async function decideApproval(ctx: Ctx, dealId: string, approve: boolean, note: string): Promise<void> {
  requireHead(ctx);
  assertWritable(ctx);
  const deal = await loadDeal(ctx, dealId);
  if (deal.terms_status !== "pending_approval") throw new ValidationError("This deal is not waiting for approval.");
  const text = note.trim();
  if (!approve && !text) throw new ValidationError("A rejection needs a note.");
  const sb = getServiceClient();
  const now = new Date().toISOString();
  const update: Row = { terms_status: approve ? "approved" : "rejected", terms_approved_by: await headId(ctx), terms_approved_at: now };
  if (!approve) {
    update.stage = "negotiating";
    update.payment_terms = "75_25";
  }
  const res = await sb.from("deals").update(update).eq("id", dealId);
  if (res.error) throw new Error(`deals: ${res.error.message}`);
  const act = await sb.from("activities").insert({
    event_id: ctx.eventId,
    brand_id: deal.brand_id,
    owner_id: deal.owner_id,
    event_type: "note",
    summary: approve ? `Terms approved by the head${text ? `: ${text}` : ""}` : `Terms rejected by the head: ${text}. Back to negotiating on 75/25.`,
    occurred_at: now,
  });
  if (act.error) throw new Error(`activities: ${act.error.message}`);
}

/** Sets pending_approval when the deal meets a rule. Returns the reasons, empty when nothing applies. */
export async function requestApproval(ctx: Ctx, dealId: string): Promise<ApprovalReason[]> {
  assertWritable(ctx);
  const deal = await loadDeal(ctx, dealId);
  if (!OPEN.includes(String(deal.stage))) throw new ValidationError("Only open deals can need approval.");
  if (deal.terms_status === "pending_approval" || deal.terms_status === "approved") return [];
  const floor = (await floors([dealId])).get(dealId) ?? null;
  const reasons = approvalReasons({
    paymentTerms: String(deal.payment_terms ?? ""),
    proposedInr: num(deal.proposed_value_inr),
    inKindInr: num(deal.signed_in_kind_inr),
    catalogFloorInr: floor,
  });
  if (reasons.length === 0) return [];
  const res = await getServiceClient().from("deals").update({ terms_status: "pending_approval", stage_changed_at: new Date().toISOString() }).eq("id", dealId);
  if (res.error) throw new Error(`deals: ${res.error.message}`);
  return reasons;
}

export async function checkOpenDeals(ctx: Ctx): Promise<{ checked: number; flagged: number }> {
  requireHead(ctx);
  assertWritable(ctx);
  const deals = await fetchAll<Row>("deals", "id, stage", { event_id: ctx.eventId });
  const open = deals.filter((d) => OPEN.includes(String(d.stage)));
  let flagged = 0;
  for (const d of open) if ((await requestApproval(ctx, String(d.id))).length > 0) flagged += 1;
  return { checked: open.length, flagged };
}