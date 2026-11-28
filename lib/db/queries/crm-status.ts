import { getServiceClient } from "@/lib/db/client";
import { assertWritable } from "@/lib/db/guards";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/db/errors";
import { addBusinessDays } from "@/lib/domain/bizdays";
import { validateTransition, type StatusChangeInput } from "@/lib/domain/crm-rules";
import { paymentSplit } from "@/lib/domain/payments";
import type { StatusCode } from "@/lib/domain/status";
import { resolveAssumptions } from "@/lib/model/assumptions";
import type { Ctx } from "@/lib/types";
import { getHolidays } from "./holidays";
import { num } from "./page";

type BrandState = {
  id: string;
  name: string;
  owner_id: string | null;
  crm_status: StatusCode;
  call_attempts: number;
  first_outreach_at: string | null;
  first_response_at: string | null;
};

async function loadOwnedBrand(ctx: Ctx, brandId: string): Promise<BrandState> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("brands")
    .select("id, name, event_id, owner_id, crm_status, call_attempts, first_outreach_at, first_response_at")
    .eq("id", brandId)
    .maybeSingle();
  if (error) throw new Error(`brands: ${error.message}`);
  if (!data || data.event_id !== ctx.eventId || !data.crm_status) throw new NotFoundError("Company not found.");
  if (ctx.role === "coordinator" && data.owner_id !== ctx.memberId) throw new ForbiddenError("This company belongs to another coordinator.");
  return {
    id: String(data.id),
    name: String(data.name),
    owner_id: (data.owner_id as string | null) ?? null,
    crm_status: data.crm_status as StatusCode,
    call_attempts: num(data.call_attempts),
    first_outreach_at: (data.first_outreach_at as string | null) ?? null,
    first_response_at: (data.first_response_at as string | null) ?? null,
  };
}

/** Turn a database guard message into a friendly validation error. */
function friendly(message: string): Error {
  if (message.includes("Didn") || message.includes("Ghosting")) return new ValidationError(message);
  return new Error(message);
}

const OUTREACH_STATUSES: StatusCode[] = ["slabs_sent", "didnt_pick", "contacted", "ghosting", "prospective", "converted", "rejected"];
const RESPONSE_STATUSES: StatusCode[] = ["contacted", "prospective", "converted", "rejected"];

async function logStatusActivity(ctx: Ctx, brand: BrandState, note: string | null, to: StatusCode): Promise<void> {
  const supabase = getServiceClient();
  await supabase.from("activities").insert({
    event_id: ctx.eventId,
    brand_id: brand.id,
    owner_id: brand.owner_id,
    event_type: "status_change",
    outcome: to,
    summary: note,
    occurred_at: new Date().toISOString(),
  });
}

/** Payment rows follow the deal's payment_terms: 100_0 (one row), 75_25 or 50_50. Cash portion only. */
async function createPaymentRows(ctx: Ctx, brandId: string): Promise<{ dealId: string | null; created: number }> {
  const supabase = getServiceClient();
  const { data: deals, error } = await supabase
    .from("deals")
    .select("id, signed_cash_inr, stage_changed_at, payment_terms")
    .eq("brand_id", brandId)
    .eq("stage", "partner_confirmed")
    .order("stage_changed_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`deals: ${error.message}`);
  const deal = deals?.[0];
  if (!deal) return { dealId: null, created: 0 };
  const dealId = String(deal.id);
  const { count, error: cErr } = await supabase.from("payments").select("id", { count: "exact", head: true }).eq("deal_id", dealId);
  if (cErr) throw new Error(`payments: ${cErr.message}`);
  if ((count ?? 0) > 0) return { dealId, created: 0 };
  const cash = num(deal.signed_cash_inr);
  if (cash <= 0) return { dealId, created: 0 };

  const a = resolveAssumptions(ctx.event.model_assumptions);
  const split = paymentSplit(cash, (deal.payment_terms as string | null) ?? "75_25");
  const prePct = Math.round(split.share * 100);
  const rows: Record<string, unknown>[] = [
    { deal_id: dealId, amount_inr: split.pre, due_date: a.prefest_due_date, phase: "pre_fest", note: `Pre-fest instalment (${prePct}%)` },
  ];
  if (split.post > 0) {
    rows.push({ deal_id: dealId, amount_inr: split.post, due_date: a.postfest_due_date, phase: "post_fest", note: `Post-fest instalment (${100 - prePct}%)` });
  }
  const { error: iErr } = await supabase.from("payments").insert(rows);
  if (iErr) throw new Error(`payments: ${iErr.message}`);
  return { dealId, created: rows.length };
}

export async function changeCompanyStatus(ctx: Ctx, input: StatusChangeInput, opts?: { viaMou?: boolean }): Promise<{ dealId: string | null; paymentsCreated: number }> {
  assertWritable(ctx);
  const brand = await loadOwnedBrand(ctx, input.brandId);
  if (input.to === "converted" && !opts?.viaMou) throw new ValidationError("A company closes through its MoU: build the slab, send the MoU, then mark it signed by both sides.");
  const problem = validateTransition(brand.crm_status, input);
  if (problem) throw new ValidationError(problem);

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { crm_status: input.to, last_touch_at: now };
  if (OUTREACH_STATUSES.includes(input.to) && !brand.first_outreach_at) patch.first_outreach_at = now;
  if (RESPONSE_STATUSES.includes(input.to) && !brand.first_response_at) patch.first_response_at = now;
  if (input.note) patch.notes = input.note;

  if (input.to === "prospective") {
    patch.approx_amount_inr = input.approxAmountInr;
    const holidays = await getHolidays(ctx.eventId);
    patch.next_follow_up = input.nextFollowUp ?? addBusinessDays(ctx.todayIst, 3, holidays);
  } else if (input.nextFollowUp !== undefined) {
    patch.next_follow_up = input.nextFollowUp;
  }
  if (input.to === "converted") {
    patch.final_amount_inr = input.finalAmountInr;
    patch.final_in_kind_inr = input.inKindInr ?? 0;
    patch.next_follow_up = null;
  }
  if (input.to === "rejected") {
    patch.rejection_reason = (input.rejectionReason ?? "").trim();
    patch.next_follow_up = null;
  }

  const supabase = getServiceClient();
  const { error } = await supabase.from("brands").update(patch).eq("id", brand.id);
  if (error) throw friendly(error.message);
  await logStatusActivity(ctx, brand, input.note ?? null, input.to);
  if (RESPONSE_STATUSES.includes(input.to)) await supabase.from("tasks").delete().eq("brand_id", brand.id).eq("source", "sequence").eq("status", "todo");

  if (input.to === "converted") {
    const res = opts?.viaMou ? { dealId: null, created: 0 } : await createPaymentRows(ctx, brand.id);
    return { dealId: res.dealId, paymentsCreated: res.created };
  }
  return { dealId: null, paymentsCreated: 0 };
}

export type ActivityKind = "call" | "call_no_answer" | "note";

/** Quick actions. A call with no answer adds an attempt but never changes the status. */
export async function logActivity(
  ctx: Ctx,
  input: { brandId: string; kind: ActivityKind; note?: string | null; nextFollowUp?: string | null },
): Promise<{ attempts: number }> {
  assertWritable(ctx);
  const brand = await loadOwnedBrand(ctx, input.brandId);
  const supabase = getServiceClient();
  const now = new Date().toISOString();
  const attempts = input.kind === "call_no_answer" ? brand.call_attempts + 1 : brand.call_attempts;
  const { error: aErr } = await supabase.from("activities").insert({
    event_id: ctx.eventId,
    brand_id: brand.id,
    owner_id: brand.owner_id,
    event_type: input.kind === "note" ? "note" : "call_attempt",
    outcome: input.kind === "call" ? "answered" : input.kind === "call_no_answer" ? "no_answer" : null,
    summary: input.note ?? null,
    occurred_at: now,
  });
  if (aErr) throw new Error(`activities: ${aErr.message}`);
  const patch: Record<string, unknown> = { last_touch_at: now, call_attempts: attempts };
  if (input.nextFollowUp !== undefined) patch.next_follow_up = input.nextFollowUp;
  const { error } = await supabase.from("brands").update(patch).eq("id", brand.id);
  if (error) throw new Error(`brands: ${error.message}`);
  return { attempts };
}

export async function setFollowUp(ctx: Ctx, brandId: string, date: string | null): Promise<void> {
  assertWritable(ctx);
  const brand = await loadOwnedBrand(ctx, brandId);
  const { error } = await getServiceClient().from("brands").update({ next_follow_up: date }).eq("id", brand.id);
  if (error) throw new Error(`brands: ${error.message}`);
}