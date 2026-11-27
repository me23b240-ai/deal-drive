import { getServiceClient } from "../client";
import { NotFoundError } from "../errors";
import { assertWritable, requireHead } from "../guards";
import type { Ctx } from "../../types";
import { fetchAll, num } from "./page";
import { listTeam } from "./team";

type Row = Record<string, unknown>;

export type PaymentRow = {
  id: string;
  dealId: string;
  company: string;
  ownerName: string;
  phase: string;
  amountInr: number;
  dueDate: string | null;
  receivedAt: string | null;
  note: string | null;
};

export type PhaseTotals = { phase: string; scheduledInr: number; collectedInr: number; pendingInr: number };
export type PaymentsData = {
  rows: PaymentRow[];
  scheduledInr: number;
  collectedInr: number;
  pendingInr: number;
  byPhase: PhaseTotals[];
};

/** Payments have no event column, so they are scoped through the event's confirmed deals. */
export async function getPaymentsData(ctx: Ctx): Promise<PaymentsData> {
  requireHead(ctx);
  const supabase = getServiceClient();
  const [deals, brands, team] = await Promise.all([
    fetchAll<Row>("deals", "id, name, brand_id, owner_id", { event_id: ctx.eventId, stage: "partner_confirmed" }),
    fetchAll<Row>("brands", "id, name", { event_id: ctx.eventId }),
    listTeam(ctx.eventId),
  ]);
  const brandName = new Map(brands.map((b) => [String(b.id), String(b.name)]));
  const nameOf = new Map(team.map((m) => [m.id, m.name]));
  const dealById = new Map(deals.map((d) => [String(d.id), d]));

  const ids = [...dealById.keys()];
  const pays: Row[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from("payments")
      .select("id, deal_id, amount_inr, due_date, received_at, note, phase")
      .in("deal_id", ids.slice(i, i + 100))
      .order("due_date");
    if (error) throw new Error(`payments: ${error.message}`);
    pays.push(...((data ?? []) as Row[]));
  }

  const rows = pays.map((p): PaymentRow => {
    const d = dealById.get(String(p.deal_id)) ?? {};
    const owner = d.owner_id ? String(d.owner_id) : null;
    return {
      id: String(p.id),
      dealId: String(p.deal_id),
      company: brandName.get(String(d.brand_id)) ?? String(d.name ?? "Unknown"),
      ownerName: owner ? (nameOf.get(owner) ?? "Unknown") : "Unassigned",
      phase: String(p.phase ?? ""),
      amountInr: num(p.amount_inr),
      dueDate: p.due_date ? String(p.due_date) : null,
      receivedAt: p.received_at ? String(p.received_at) : null,
      note: p.note ? String(p.note) : null,
    };
  });

  const phases = [...new Set(rows.map((r) => r.phase))].sort();
  const byPhase = phases.map((phase): PhaseTotals => {
    const mine = rows.filter((r) => r.phase === phase);
    const scheduledInr = mine.reduce((t, r) => t + r.amountInr, 0);
    const collectedInr = mine.filter((r) => r.receivedAt).reduce((t, r) => t + r.amountInr, 0);
    return { phase, scheduledInr, collectedInr, pendingInr: scheduledInr - collectedInr };
  });
  const scheduledInr = rows.reduce((t, r) => t + r.amountInr, 0);
  const collectedInr = rows.filter((r) => r.receivedAt).reduce((t, r) => t + r.amountInr, 0);
  return { rows, scheduledInr, collectedInr, pendingInr: scheduledInr - collectedInr, byPhase };
}

/** Only the head marks payments received. Undo clears received_at. */
export async function setPaymentReceived(ctx: Ctx, paymentId: string, received: boolean): Promise<void> {
  requireHead(ctx);
  assertWritable(ctx);
  const supabase = getServiceClient();
  const pay = await supabase.from("payments").select("id, deal_id").eq("id", paymentId).maybeSingle();
  if (pay.error) throw new Error(`payments: ${pay.error.message}`);
  if (!pay.data) throw new NotFoundError("Payment not found");
  const deal = await supabase.from("deals").select("id").eq("id", pay.data.deal_id).eq("event_id", ctx.eventId).maybeSingle();
  if (deal.error) throw new Error(`deals: ${deal.error.message}`);
  if (!deal.data) throw new NotFoundError("Payment not found for this event");
  const res = await supabase
    .from("payments")
    .update({ received_at: received ? new Date().toISOString() : null })
    .eq("id", paymentId);
  if (res.error) throw new Error(`payments: ${res.error.message}`);
}