import { getServiceClient } from "@/lib/db/client";
import { assertWritable, requireMember } from "@/lib/db/guards";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/db/errors";
import { addBusinessDays, businessDaysBetween, toIstDate } from "@/lib/domain/bizdays";
import { CHANNEL_LABELS, type ChannelCode } from "@/lib/domain/channels";
import { generateOpening, type Fact } from "@/lib/ai/draft";
import { wordCount } from "@/lib/ai/guards";
import { nextStep, stepAccess, type StepAccess } from "@/lib/mail/steps";
import { buildEmail, defaultSubject, genericOpening, SEQUENCE_STEPS, STEP_LABELS, TEMPLATE_VERSION, type SequenceStep } from "@/lib/mail/template";
import type { Ctx } from "@/lib/types";
import { changeCompanyStatus } from "./crm-status";
import { getHolidays } from "./holidays";
import { fetchAll } from "./page";
import { listTeam } from "./team";

export type MailInputs = { eventName: string; senderName: string; company: string; contactName: string | null; recipientEmail: string | null };

export type DraftView = {
  id: string;
  brandId: string;
  step: SequenceStep;
  status: string;
  subject: string;
  opening: string;
  personalised: boolean;
  warning: string | null;
  factsUsed: string[];
  mail: MailInputs;
};

export type DraftQueueItem = {
  brandId: string;
  company: string;
  crmStatus: string;
  nextStep: SequenceStep;
  idleBdays: number;
  inProgress: boolean;
};

export type ComposerState = {
  brand: { id: string; name: string; crmStatus: string };
  contacts: { id: string; name: string; jobTitle: string | null; email: string | null }[];
  steps: Record<SequenceStep, StepAccess>;
  drafts: DraftView[];
  history: { id: string; step: SequenceStep; subject: string; sentAt: string | null; personalised: boolean }[];
};

const isStep = (v: unknown): v is SequenceStep => typeof v === "string" && (SEQUENCE_STEPS as readonly string[]).includes(v);
const asStep = (v: unknown): SequenceStep => (isStep(v) ? v : "initial");
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

function readInputs(raw: unknown): { mail: MailInputs; factsUsed: string[]; warning: string | null } {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const m = o.mail && typeof o.mail === "object" ? (o.mail as Record<string, unknown>) : {};
  return {
    mail: {
      eventName: str(m.eventName) ?? "",
      senderName: str(m.senderName) ?? "",
      company: str(m.company) ?? "",
      contactName: str(m.contactName),
      recipientEmail: str(m.recipientEmail),
    },
    factsUsed: Array.isArray(o.factsUsed) ? o.factsUsed.filter((x): x is string => typeof x === "string") : [],
    warning: str(o.warning),
  };
}

type DraftRow = Record<string, unknown>;
const DRAFT_COLS = "id, event_id, brand_id, owner_id, contact_id, subject, opening_paragraph, personalised, inputs, status, sent_at, created_at, sequence_step";

function toView(row: DraftRow): DraftView {
  const inputs = readInputs(row.inputs);
  return {
    id: String(row.id),
    brandId: String(row.brand_id),
    step: asStep(row.sequence_step),
    status: String(row.status),
    subject: String(row.subject ?? ""),
    opening: String(row.opening_paragraph ?? ""),
    personalised: row.personalised === true,
    warning: inputs.warning,
    factsUsed: inputs.factsUsed,
    mail: inputs.mail,
  };
}

async function loadBrand(ctx: Ctx, brandId: string) {
  const { data, error } = await getServiceClient()
    .from("brands")
    .select("id, event_id, name, sector, source_channel, crm_status, owner_id")
    .eq("id", brandId)
    .maybeSingle();
  if (error) throw new Error(`brands: ${error.message}`);
  if (!data || data.event_id !== ctx.eventId || !data.crm_status) throw new NotFoundError("Company not found.");
  if (ctx.role === "coordinator" && data.owner_id !== ctx.memberId) throw new ForbiddenError("This company belongs to another coordinator.");
  return data;
}

async function loadDraft(ctx: Ctx, draftId: string): Promise<DraftRow> {
  const { data, error } = await getServiceClient().from("email_drafts").select(DRAFT_COLS).eq("id", draftId).maybeSingle();
  if (error) throw new Error(`email_drafts: ${error.message}`);
  if (!data || data.event_id !== ctx.eventId) throw new NotFoundError("Draft not found.");
  if (ctx.role === "coordinator" && data.owner_id !== ctx.memberId) throw new ForbiddenError("This draft belongs to another coordinator.");
  return data;
}

async function draftsFor(brandId: string): Promise<DraftRow[]> {
  const { data, error } = await getServiceClient().from("email_drafts").select(DRAFT_COLS).eq("brand_id", brandId).order("created_at", { ascending: false });
  if (error) throw new Error(`email_drafts: ${error.message}`);
  return data ?? [];
}

const sentSet = (rows: DraftRow[]): Set<SequenceStep> => new Set(rows.filter((r) => r.status === "sent").map((r) => asStep(r.sequence_step)));

/** Companies that currently have a mail step available, follow-ups first by how long they have been idle. */
export async function getDraftQueue(ctx: Ctx): Promise<DraftQueueItem[]> {
  const me = requireMember(ctx);
  const [brands, drafts, holidays] = await Promise.all([
    fetchAll<Record<string, unknown>>("brands", "id, name, crm_status, last_touch_at, created_at", { event_id: ctx.eventId, owner_id: me }),
    fetchAll<Record<string, unknown>>("email_drafts", "brand_id, status, sequence_step", { event_id: ctx.eventId, owner_id: me }),
    getHolidays(ctx.eventId),
  ]);
  const byBrand = new Map<string, DraftRow[]>();
  for (const d of drafts) byBrand.set(String(d.brand_id), [...(byBrand.get(String(d.brand_id)) ?? []), d]);
  const out: DraftQueueItem[] = [];
  for (const b of brands) {
    if (!b.crm_status) continue;
    const mine = byBrand.get(String(b.id)) ?? [];
    const step = nextStep(String(b.crm_status), sentSet(mine));
    if (!step) continue;
    out.push({
      brandId: String(b.id),
      company: String(b.name),
      crmStatus: String(b.crm_status),
      nextStep: step,
      idleBdays: businessDaysBetween(toIstDate(String(b.last_touch_at ?? b.created_at)), ctx.todayIst, holidays),
      inProgress: mine.some((d) => d.status !== "sent"),
    });
  }
  const rank = (s: SequenceStep): number => (s === "initial" ? 1 : 0);
  return out.sort((a, b) => rank(a.nextStep) - rank(b.nextStep) || b.idleBdays - a.idleBdays || a.company.localeCompare(b.company)).slice(0, 80);
}

export async function getComposerState(ctx: Ctx, brandId: string): Promise<ComposerState> {
  const brand = await loadBrand(ctx, brandId);
  const supabase = getServiceClient();
  const [contacts, drafts] = await Promise.all([
    supabase.from("contacts").select("id, name, job_title, email, created_at").eq("brand_id", brandId).order("created_at"),
    draftsFor(brandId),
  ]);
  if (contacts.error) throw new Error(`contacts: ${contacts.error.message}`);
  const status = String(brand.crm_status);
  return {
    brand: { id: String(brand.id), name: String(brand.name), crmStatus: status },
    contacts: (contacts.data ?? [])
      .map((c) => ({ id: String(c.id), name: String(c.name), jobTitle: str(c.job_title), email: str(c.email) }))
      .sort((a, b) => Number(Boolean(b.email)) - Number(Boolean(a.email))),
    steps: stepAccess(status, sentSet(drafts)),
    drafts: drafts.filter((d) => d.status !== "sent").map(toView),
    history: drafts
      .filter((d) => d.status === "sent")
      .map((d) => ({ id: String(d.id), step: asStep(d.sequence_step), subject: String(d.subject ?? ""), sentAt: str(d.sent_at), personalised: d.personalised === true })),
  };
}

async function pickFacts(ctx: Ctx, sector: string | null): Promise<Fact[]> {
  const rows = await fetchAll<Record<string, unknown>>("fact_bank", "id, fact, sector_tags, needs_review, is_active", { event_id: ctx.eventId });
  const want = (sector ?? "").toLowerCase();
  const usable = rows.filter((r) => r.is_active === true && r.needs_review !== true && typeof r.fact === "string");
  const tags = (r: Record<string, unknown>): string[] => (Array.isArray(r.sector_tags) ? r.sector_tags.map((t) => String(t).toLowerCase()) : []);
  const matched = usable.filter((r) => want && tags(r).includes(want));
  const general = usable.filter((r) => tags(r).includes("all") && !matched.includes(r));
  return [...matched, ...general].slice(0, 4).map((r) => ({ id: String(r.id), fact: String(r.fact) }));
}

export async function createDraft(ctx: Ctx, input: { brandId: string; contactId?: string | null; step: SequenceStep; personalise: boolean }): Promise<DraftView> {
  assertWritable(ctx);
  const me = requireMember(ctx);
  const brand = await loadBrand(ctx, input.brandId);
  const supabase = getServiceClient();
  const existing = await draftsFor(brand.id as string);
  const access = stepAccess(String(brand.crm_status), sentSet(existing))[input.step];
  if (!access.enabled) throw new ValidationError(`${STEP_LABELS[input.step]} isn't available: ${access.reason ?? "not allowed right now"}`);

  const { data: contacts, error: cErr } = await supabase.from("contacts").select("id, name, job_title, email, created_at").eq("brand_id", brand.id).order("created_at");
  if (cErr) throw new Error(`contacts: ${cErr.message}`);
  const list = contacts ?? [];
  const contact = (input.contactId ? list.find((c) => c.id === input.contactId) : undefined) ?? list.find((c) => c.email) ?? list[0];

  const team = await listTeam(ctx.eventId);
  const senderName = team.find((m) => m.id === me)?.name ?? "The sponsorship team";
  const eventName = ctx.event.name;
  const company = String(brand.name);

  let opening = genericOpening(input.step, eventName, company);
  let factsUsed: string[] = [];
  let warning: string | null = null;
  let model: string | null = null;
  let usedAi = false;
  if (input.personalise) {
    const [facts, acts] = await Promise.all([
      pickFacts(ctx, (brand.sector as string | null) ?? null),
      supabase.from("activities").select("summary, occurred_at").eq("brand_id", brand.id).order("occurred_at", { ascending: false }).limit(6),
    ]);
    const lastSent = existing.find((d) => d.status === "sent" && d.sent_at);
    const res = await generateOpening({
      step: input.step,
      eventName,
      company,
      sector: (brand.sector as string | null) ?? null,
      channelLabel: brand.source_channel ? CHANNEL_LABELS[brand.source_channel as ChannelCode] ?? null : null,
      contactRole: contact ? str(contact.job_title) : null,
      notes: (acts.data ?? []).map((a) => str(a.summary)).filter((s): s is string => s !== null).slice(0, 3).map((s) => s.slice(0, 160)),
      facts,
      lastMailSentOn: lastSent ? toIstDate(String(lastSent.sent_at)) : null,
    });
    opening = res.opening;
    warning = res.warning;
    model = res.model;
    usedAi = res.usedAi;
    factsUsed = res.factsUsed.map((id) => facts.find((f) => f.id === id)?.fact).filter((f): f is string => Boolean(f));
  }

  const mail: MailInputs = { eventName, senderName, company, contactName: contact ? String(contact.name) : null, recipientEmail: contact ? str(contact.email) : null };
  const subject = defaultSubject(input.step, eventName, company);
  const email = buildEmail({ step: input.step, ...mail, subject, opening });
  const row = {
    event_id: ctx.eventId,
    brand_id: brand.id,
    contact_id: contact ? contact.id : null,
    owner_id: me,
    subject,
    opening_paragraph: opening,
    body_html: email.html,
    personalised: usedAi,
    inputs: { mail, factsUsed, warning },
    model,
    status: "draft",
    sequence_step: input.step,
    template_version: TEMPLATE_VERSION,
  };
  const old = existing.find((d) => d.status !== "sent" && asStep(d.sequence_step) === input.step);
  const q = old ? supabase.from("email_drafts").update(row).eq("id", old.id) : supabase.from("email_drafts").insert(row);
  const { data, error } = await q.select(DRAFT_COLS).single();
  if (error) throw new Error(`email_drafts: ${error.message}`);
  return toView(data);
}

export async function updateDraft(ctx: Ctx, draftId: string, edits: { subject: string; opening: string }): Promise<DraftView> {
  assertWritable(ctx);
  const row = await loadDraft(ctx, draftId);
  if (row.status === "sent") throw new ValidationError("This mail is already marked sent.");
  const opening = edits.opening.trim();
  const subject = edits.subject.trim();
  if (!opening) throw new ValidationError("The opening paragraph can't be empty.");
  if (wordCount(opening) > 150) throw new ValidationError("Keep the opening under 150 words.");
  if (!subject) throw new ValidationError("The subject can't be empty.");
  const inputs = readInputs(row.inputs);
  const email = buildEmail({ step: asStep(row.sequence_step), ...inputs.mail, subject, opening });
  const { data, error } = await getServiceClient()
    .from("email_drafts")
    .update({ subject, opening_paragraph: opening, body_html: email.html, status: "reviewed" })
    .eq("id", draftId)
    .select(DRAFT_COLS)
    .single();
  if (error) throw new Error(`email_drafts: ${error.message}`);
  return toView(data);
}

/** After the mail is sent from Gmail: draft sent, activity logged, status and follow-up date moved. */
export async function markDraftSent(ctx: Ctx, draftId: string, edits?: { subject: string; opening: string }): Promise<void> {
  assertWritable(ctx);
  if (edits) await updateDraft(ctx, draftId, edits);
  const row = await loadDraft(ctx, draftId);
  if (row.status === "sent") throw new ValidationError("This mail is already marked sent.");
  const supabase = getServiceClient();
  const brand = await loadBrand(ctx, String(row.brand_id));
  const step = asStep(row.sequence_step);
  const holidays = await getHolidays(ctx.eventId);
  const followUp = addBusinessDays(ctx.todayIst, 3, holidays);
  const now = new Date().toISOString();

  const { error } = await supabase.from("email_drafts").update({ status: "sent", sent_at: now }).eq("id", draftId);
  if (error) throw new Error(`email_drafts: ${error.message}`);

  if (brand.crm_status === "to_contact" || brand.crm_status === "send_mail") {
    await changeCompanyStatus(ctx, { brandId: String(brand.id), to: "slabs_sent", nextFollowUp: followUp, note: null });
  } else {
    const { error: bErr } = await supabase.from("brands").update({ last_touch_at: now, next_follow_up: followUp }).eq("id", brand.id);
    if (bErr) throw new Error(`brands: ${bErr.message}`);
  }
  const { error: aErr } = await supabase.from("activities").insert({
    event_id: ctx.eventId,
    brand_id: brand.id,
    contact_id: row.contact_id ?? null,
    owner_id: brand.owner_id,
    event_type: "mail_sent",
    summary: `${STEP_LABELS[step]}: ${String(row.subject ?? "")}`,
    occurred_at: now,
    personalised: row.personalised === true,
    email_draft_id: draftId,
  });
  if (aErr) throw new Error(`activities: ${aErr.message}`);
}