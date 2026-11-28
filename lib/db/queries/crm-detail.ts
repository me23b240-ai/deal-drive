import { getServiceClient } from "@/lib/db/client";
import { assertWritable } from "@/lib/db/guards";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/db/errors";
import { STATUS_LABELS, type StatusCode } from "@/lib/domain/status";
import type { Ctx } from "@/lib/types";
import { num } from "./page";
import type { PipelineFacts } from "@/lib/domain/pipeline";

export type ContactRow = { id: string; name: string; jobTitle: string | null; email: string | null; phone: string | null; linkedinUrl: string | null };
export type TimelineItem = { at: string; kind: "status" | "activity"; title: string; detail: string | null };
export type PaymentRow = { id: string; amountInr: number; dueOn: string | null; phase: string | null; receivedAt: string | null };

export type CompanyDetail = {
  id: string;
  name: string;
  industry: string | null;
  sector: string | null;
  crmStatus: string;
  channel: string | null;
  tier: string | null;
  approxAmountInr: number;
  finalAmountInr: number;
  finalInKindInr: number;
  rejectionReason: string | null;
  nextFollowUp: string | null;
  lastTouchAt: string | null;
  notes: string | null;
  linkedinUrl: string | null;
  callAttempts: number;
  contacts: ContactRow[];
  timeline: TimelineItem[];
  deal: { id: string; stage: string; proposedInr: number; signedInr: number; cashInr: number; inKindInr: number; nextFollowUp: string | null } | null;
  payments: PaymentRow[];
  pipeline?: PipelineFacts;
};

const ACTIVITY_TITLES: Record<string, string> = {
  call_attempt: "Call",
  note: "Note",
  mail_sent: "Mail sent",
  follow_up: "Follow-up nudge",
  status_change: "Status change",
  outreach_sent: "Outreach sent",
  replied: "Reply received",
};

const s = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const label = (code: string | null): string => (code && code in STATUS_LABELS ? STATUS_LABELS[code as StatusCode] : "New");

export async function getCompanyDetail(ctx: Ctx, brandId: string): Promise<CompanyDetail> {
  const supabase = getServiceClient();
  const { data: b, error } = await supabase
    .from("brands")
    .select(
      "id, event_id, name, industry, sector, owner_id, crm_status, source_channel, company_tier, approx_amount_inr, final_amount_inr, final_in_kind_inr, rejection_reason, next_follow_up, last_touch_at, notes, linkedin_url, call_attempts",
    )
    .eq("id", brandId)
    .maybeSingle();
  if (error) throw new Error(`brands: ${error.message}`);
  if (!b || b.event_id !== ctx.eventId || !b.crm_status) throw new NotFoundError("Company not found.");
  if (ctx.role === "coordinator" && b.owner_id !== ctx.memberId) throw new ForbiddenError("This company belongs to another coordinator.");

  const [contacts, events, acts, deals] = await Promise.all([
    supabase.from("contacts").select("id, name, job_title, email, phone, linkedin_url, created_at").eq("brand_id", brandId).order("created_at"),
    supabase.from("status_events").select("from_status, to_status, note, occurred_at").eq("brand_id", brandId).order("occurred_at", { ascending: false }).limit(40),
    supabase.from("activities").select("event_type, outcome, summary, occurred_at").eq("brand_id", brandId).order("occurred_at", { ascending: false }).limit(40),
    supabase
      .from("deals")
      .select("id, stage, proposed_value_inr, signed_value_inr, signed_cash_inr, signed_in_kind_inr, next_follow_up, created_at")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  for (const r of [contacts, events, acts, deals]) if (r.error) throw new Error(r.error.message);

  const deal = deals.data?.[0];
  let payments: PaymentRow[] = [];
  if (deal) {
    const p = await supabase.from("payments").select("id, amount_inr, due_date, phase, received_at").eq("deal_id", String(deal.id)).order("due_date");
    if (p.error) throw new Error(`payments: ${p.error.message}`);
    payments = (p.data ?? []).map((r) => ({
      id: String(r.id),
      amountInr: num(r.amount_inr),
      dueOn: s(r.due_date),
      phase: s(r.phase),
      receivedAt: s(r.received_at),
    }));
  }

  const timeline: TimelineItem[] = [
    ...(events.data ?? []).map((e): TimelineItem => ({
      at: String(e.occurred_at),
      kind: "status",
      title: `${label(s(e.from_status))} to ${label(s(e.to_status))}`,
      detail: s(e.note),
    })),
    ...(acts.data ?? [])
      .filter((a) => a.event_type !== "status_change")
      .map((a): TimelineItem => ({
        at: String(a.occurred_at),
        kind: "activity",
        title: `${ACTIVITY_TITLES[String(a.event_type)] ?? String(a.event_type)}${a.outcome ? ` (${String(a.outcome).replace("_", " ")})` : ""}`,
        detail: s(a.summary),
      })),
  ].sort((x, y) => y.at.localeCompare(x.at));

  return {
    id: String(b.id),
    name: String(b.name),
    industry: s(b.industry),
    sector: s(b.sector),
    crmStatus: String(b.crm_status),
    channel: s(b.source_channel),
    tier: s(b.company_tier),
    approxAmountInr: num(b.approx_amount_inr),
    finalAmountInr: num(b.final_amount_inr),
    finalInKindInr: num(b.final_in_kind_inr),
    rejectionReason: s(b.rejection_reason),
    nextFollowUp: s(b.next_follow_up),
    lastTouchAt: s(b.last_touch_at),
    notes: s(b.notes),
    linkedinUrl: s(b.linkedin_url),
    callAttempts: num(b.call_attempts),
    contacts: (contacts.data ?? []).map((c) => ({
      id: String(c.id),
      name: String(c.name),
      jobTitle: s(c.job_title),
      email: s(c.email),
      phone: s(c.phone),
      linkedinUrl: s(c.linkedin_url),
    })),
    timeline,
    deal: deal
      ? {
          id: String(deal.id),
          stage: String(deal.stage),
          proposedInr: num(deal.proposed_value_inr),
          signedInr: num(deal.signed_value_inr),
          cashInr: num(deal.signed_cash_inr),
          inKindInr: num(deal.signed_in_kind_inr),
          nextFollowUp: s(deal.next_follow_up),
        }
      : null,
    payments,
  };
}

export type PocInput = { id?: string | null; name: string; jobTitle?: string | null; email?: string | null; phone?: string | null; linkedinUrl?: string | null };

/** Add or edit a point of contact on one of the coordinator's companies. */
export async function upsertContact(ctx: Ctx, brandId: string, input: PocInput): Promise<ContactRow> {
  assertWritable(ctx);
  const name = input.name.trim();
  if (!name) throw new ValidationError("A contact needs a name.");
  const email = input.email?.trim() || null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ValidationError("That email address doesn't look right.");
  const supabase = getServiceClient();
  const { data: b, error: bErr } = await supabase.from("brands").select("id, event_id, owner_id").eq("id", brandId).maybeSingle();
  if (bErr) throw new Error(`brands: ${bErr.message}`);
  if (!b || b.event_id !== ctx.eventId) throw new NotFoundError("Company not found.");
  if (ctx.role === "coordinator" && b.owner_id !== ctx.memberId) throw new ForbiddenError("This company belongs to another coordinator.");
  const row = {
    brand_id: brandId,
    name,
    job_title: input.jobTitle?.trim() || null,
    email,
    phone: input.phone?.trim() || null,
    linkedin_url: input.linkedinUrl?.trim() || null,
  };
  const q = input.id
    ? supabase.from("contacts").update(row).eq("id", input.id).eq("brand_id", brandId)
    : supabase.from("contacts").insert(row);
  const { data, error } = await q.select("id, name, job_title, email, phone, linkedin_url").single();
  if (error) throw new Error(`contacts: ${error.message}`);
  return {
    id: String(data.id),
    name: String(data.name),
    jobTitle: s(data.job_title),
    email: s(data.email),
    phone: s(data.phone),
    linkedinUrl: s(data.linkedin_url),
  };
}