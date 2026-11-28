import { getServiceClient } from "@/lib/db/client";
import { assertWritable } from "@/lib/db/guards";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/db/errors";
import { addBusinessDays, toIstDate } from "@/lib/domain/bizdays";
import { dealTotals, defaultProformaDue } from "@/lib/domain/mou-flow";
import { validateMou, type MouFields } from "@/lib/domain/mou-template";
import { PAYMENT_TERMS, paymentRowsByTerms, readPaymentDues, type PaymentRow, type PaymentTerms } from "@/lib/domain/payments";
import { checkDealMove, validateConversion, type DealFacts, type PipelineFacts } from "@/lib/domain/pipeline";
import type { Ctx } from "@/lib/types";
import { getCompanyDetail, type CompanyDetail } from "./crm-detail";
import { changeCompanyStatus } from "./crm-status";
import { getHolidays } from "./holidays";
import { num } from "./page";

const MIGRATION_HINT = "The MoU tables aren't ready yet. Run the database migration, then reload.";

type Loaded = {
  brand: Record<string, unknown>;
  deal: Record<string, unknown>;
  items: Record<string, unknown>[];
  stage: string;
  terms: PaymentTerms | null;
  totals: ReturnType<typeof dealTotals>;
};

const termsOf = (v: unknown): PaymentTerms | null => ((PAYMENT_TERMS as string[]).includes(String(v)) ? (String(v) as PaymentTerms) : null);

async function load(ctx: Ctx, brandId: string): Promise<Loaded> {
  const supabase = getServiceClient();
  const { data: brand, error } = await supabase.from("brands").select("id, event_id, name, sector, crm_status, owner_id").eq("id", brandId).maybeSingle();
  if (error) throw new Error(`brands: ${error.message}`);
  if (!brand || brand.event_id !== ctx.eventId || !brand.crm_status) throw new NotFoundError("Company not found.");
  if (ctx.role === "coordinator" && !ctx.isCloser && brand.owner_id !== ctx.memberId) throw new ForbiddenError("This company belongs to another coordinator.");
  const { data: deals, error: dErr } = await supabase
    .from("deals")
    .select("id, stage, proposed_value_inr, payment_terms, terms_status, mou_sent_at, mou_signed_at, owner_id")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (dErr) throw new Error(dErr.message.includes("terms_status") || dErr.message.includes("mou_sent_at") ? MIGRATION_HINT : `deals: ${dErr.message}`);
  const deal = deals?.[0];
  if (!deal) throw new ValidationError("This company has no deal yet. Move it to Prospective first, which opens its deal.");
  const { data: items, error: iErr } = await supabase.from("deal_items").select("id, catalog_id, name, category, qty, unit_price_inr, in_kind").eq("deal_id", deal.id).order("created_at");
  if (iErr) throw new Error(iErr.message.includes("deal_items") ? MIGRATION_HINT : `deal_items: ${iErr.message}`);
  const rows = items ?? [];
  const raw = String(deal.stage);
  return {
    brand,
    deal,
    items: rows,
    stage: raw === "contacted" ? "prospecting" : raw,
    terms: termsOf(deal.payment_terms),
    totals: dealTotals(rows.map((r) => ({ category: typeof r.category === "string" ? r.category : null, qty: num(r.qty) || 1, unitPriceInr: num(r.unit_price_inr), inKind: r.in_kind === true }))),
  };
}

const factsOf = (l: Loaded, mouSignedOn: string | null): DealFacts => ({
  itemCount: l.totals.count,
  paymentTerms: l.terms,
  termsStatus: String(l.deal.terms_status ?? "auto"),
  mouSignedOn,
});

export type MouState = {
  brand: { id: string; name: string; crmStatus: string };
  deal: { id: string; stage: string; terms: PaymentTerms | null; termsStatus: string; mouSentAt: string | null; mouSignedAt: string | null; totalInr: number; inKindInr: number; cashInr: number };
  fields: MouFields;
  saved: boolean;
  eventName: string;
  paymentPreview: PaymentRow[];
  sendBlocked: string | null;
  today: string;
};

export async function getMouState(ctx: Ctx, brandId: string): Promise<MouState> {
  const l = await load(ctx, brandId);
  const supabase = getServiceClient();
  const { data: saved } = await supabase.from("mous").select("*").eq("deal_id", l.deal.id).maybeSingle();
  const start = ctx.event.starts_at ? toIstDate(ctx.event.starts_at) : ctx.todayIst;
  const end = ctx.event.ends_at ? toIstDate(ctx.event.ends_at) : start;
  const terms = l.terms ?? "100_0";

  const defaults: MouFields = {
    brandName: String(l.brand.name),
    officialAddress: "",
    signatoryName: "",
    signatoryDesignation: "",
    tagline: "",
    deliverables: l.items.filter((r) => r.category !== "Discount").map((r) => ({ name: String(r.name), qty: num(r.qty) || 1 })),
    amountInr: l.totals.totalInr,
    terms,
    gstin: "",
    mouDate: ctx.todayIst,
    proformaDueDate: defaultProformaDue(start, ctx.todayIst),
    deliveryWindow: "",
  };
  const s = saved as Record<string, unknown> | null;
  const fields: MouFields = s
    ? {
        brandName: String(s.brand_name ?? defaults.brandName),
        officialAddress: String(s.official_address ?? ""),
        signatoryName: String(s.signatory_name ?? ""),
        signatoryDesignation: String(s.signatory_designation ?? ""),
        tagline: String(s.tagline ?? ""),
        deliverables: Array.isArray(s.deliverables) ? (s.deliverables as { name?: unknown; qty?: unknown }[]).map((d) => ({ name: String(d.name ?? ""), qty: num(d.qty) || 1 })) : defaults.deliverables,
        amountInr: num(s.amount_inr),
        terms: termsOf(s.payment_split) ?? terms,
        gstin: String(s.gstin ?? ""),
        mouDate: String(s.mou_date ?? defaults.mouDate),
        proformaDueDate: String(s.proforma_due_date ?? defaults.proformaDueDate),
        deliveryWindow: String(s.delivery_window ?? ""),
      }
    : defaults;

  return {
    brand: { id: String(l.brand.id), name: String(l.brand.name), crmStatus: String(l.brand.crm_status) },
    deal: {
      id: String(l.deal.id),
      stage: l.stage,
      terms: l.terms,
      termsStatus: String(l.deal.terms_status ?? "auto"),
      mouSentAt: typeof l.deal.mou_sent_at === "string" ? l.deal.mou_sent_at : null,
      mouSignedAt: typeof l.deal.mou_signed_at === "string" ? l.deal.mou_signed_at : null,
      totalInr: l.totals.totalInr,
      inKindInr: l.totals.inKindInr,
      cashInr: l.totals.cashInr,
    },
    fields,
    saved: Boolean(s),
    eventName: ctx.event.name,
    paymentPreview: paymentRowsByTerms({ terms, cashInr: l.totals.cashInr, eventStart: start, eventEnd: end, dues: readPaymentDues(ctx.event.model_assumptions) }),
    sendBlocked: l.stage === "mou_sent" || l.stage === "partner_confirmed" ? "The MoU has already been sent." : checkDealMove(l.stage, "mou_sent", factsOf(l, null)),
    today: ctx.todayIst,
  };
}

export async function saveMou(ctx: Ctx, brandId: string, fields: MouFields): Promise<void> {
  assertWritable(ctx);
  const l = await load(ctx, brandId);
  if (l.stage === "partner_confirmed") throw new ValidationError("This MoU is signed and can't be edited.");
  const clean: MouFields = { ...fields, gstin: fields.gstin.trim().toUpperCase() };
  const errors = validateMou(clean);
  const first = Object.values(errors)[0];
  if (first) throw new ValidationError(first);
  const row = {
    deal_id: l.deal.id,
    brand_name: clean.brandName.trim(),
    official_address: clean.officialAddress.trim(),
    signatory_name: clean.signatoryName.trim(),
    signatory_designation: clean.signatoryDesignation.trim(),
    tagline: clean.tagline.trim() || null,
    gstin: clean.gstin,
    deliverables: clean.deliverables.map((d) => ({ name: d.name.trim(), qty: d.qty })),
    amount_inr: clean.amountInr,
    payment_split: clean.terms,
    mou_date: clean.mouDate,
    proforma_due_date: clean.proformaDueDate,
    delivery_window: clean.deliveryWindow?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const supabase = getServiceClient();
  const { data: existing } = await supabase.from("mous").select("id").eq("deal_id", l.deal.id).maybeSingle();
  const { error } = existing ? await supabase.from("mous").update(row).eq("id", existing.id) : await supabase.from("mous").insert(row);
  if (error) throw new Error(`mous: ${error.message}`);
}

export async function markMouSent(ctx: Ctx, brandId: string): Promise<{ taskWarning: string | null }> {
  assertWritable(ctx);
  const l = await load(ctx, brandId);
  if (l.stage === "mou_sent" || l.stage === "partner_confirmed") throw new ValidationError("The MoU has already been sent.");
  const supabase = getServiceClient();
  const { data: saved } = await supabase.from("mous").select("id").eq("deal_id", l.deal.id).maybeSingle();
  if (!saved) throw new ValidationError("Save the MoU details first.");
  const problem = checkDealMove(l.stage, "mou_sent", factsOf(l, null));
  if (problem) throw new ValidationError(problem);

  const now = new Date().toISOString();
  const { error } = await supabase.from("deals").update({ stage: "mou_sent", stage_changed_at: now, mou_sent_at: ctx.todayIst }).eq("id", l.deal.id);
  if (error) throw new Error(`deals: ${error.message}`);
  await supabase.from("brands").update({ last_touch_at: now }).eq("id", l.brand.id);
  await supabase.from("activities").insert({ event_id: ctx.eventId, brand_id: l.brand.id, owner_id: l.brand.owner_id, event_type: "note", summary: "MoU sent for signature", occurred_at: now });

  const holidays = await getHolidays(ctx.eventId);
  const { error: tErr } = await supabase.from("tasks").insert({
    event_id: ctx.eventId,
    title: `Chase MoU signature: ${String(l.brand.name)}`,
    owner_id: l.brand.owner_id,
    created_by: ctx.memberId,
    brand_id: l.brand.id,
    due_date: addBusinessDays(ctx.todayIst, 3, holidays),
    status: "todo",
    source: "sequence",
  });
  return { taskWarning: tErr ? `The MoU is marked sent, but the chase task couldn't be created (${tErr.message.slice(0, 80)}).` : null };
}

export async function markMouSigned(ctx: Ctx, brandId: string, signedOn: string): Promise<{ paymentsCreated: number; warnings: string[] }> {
  assertWritable(ctx);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(signedOn)) throw new ValidationError("Enter the signed date.");
  if (signedOn > ctx.todayIst) throw new ValidationError("The signed date can't be in the future.");
  const l = await load(ctx, brandId);
  const sentOn = typeof l.deal.mou_sent_at === "string" ? l.deal.mou_sent_at : null;
  if (l.stage !== "mou_sent") throw new ValidationError(checkDealMove(l.stage, "partner_confirmed", factsOf(l, signedOn)) ?? "Send the MoU before marking it signed.");
  if (sentOn && signedOn < sentOn) throw new ValidationError("The signed date can't be before the MoU was sent.");
  const problem = validateConversion(factsOf(l, signedOn));
  if (problem) throw new ValidationError(problem);

  const supabase = getServiceClient();
  const catalogIds = l.items.map((r) => r.catalog_id).filter((x): x is string => typeof x === "string");
  if (catalogIds.length > 0) {
    const { data: cat, error } = await supabase.from("deliverable_catalog").select("id, name, sold, sold_to").in("id", catalogIds);
    if (error) throw new Error(`deliverable_catalog: ${error.message}`);
    const clash = (cat ?? []).find((c) => c.sold === true && c.sold_to !== l.brand.id && c.sold_to !== l.deal.id);
    if (clash) throw new ValidationError(`${String(clash.name)} was sold on another deal. Update the slab first.`);
  }

  // Converting runs the same status triggers as before; payments are created below from the deal's own terms.
  // The database only allows partner_confirmed once the signed date is on the deal, so the date goes in first and is undone if closing fails.
  const dated = await supabase.from("deals").update({ mou_signed_at: signedOn }).eq("id", l.deal.id);
  if (dated.error) throw new Error(`deals: ${dated.error.message}`);
  try {
    await changeCompanyStatus(ctx, { brandId, to: "converted", finalAmountInr: l.totals.totalInr, inKindInr: l.totals.inKindInr, note: "MoU signed by both sides" }, { viaMou: true });
  } catch (error) {
    await supabase.from("deals").update({ mou_signed_at: null }).eq("id", l.deal.id);
    throw error;
  }

  const warnings: string[] = [];
  const terms = l.terms ?? "100_0";
  const start = ctx.event.starts_at ? toIstDate(ctx.event.starts_at) : ctx.todayIst;
  const end = ctx.event.ends_at ? toIstDate(ctx.event.ends_at) : start;

  const upd = await supabase
    .from("deals")
    .update({ stage: "partner_confirmed", mou_signed_at: signedOn, payment_terms: terms, signed_value_inr: l.totals.totalInr, signed_cash_inr: l.totals.cashInr, signed_in_kind_inr: l.totals.inKindInr })
    .eq("id", l.deal.id);
  if (upd.error) warnings.push(`The deal's signed amounts couldn't be saved (${upd.error.message.slice(0, 80)}).`);
  await supabase.from("mous").update({ signed_on: signedOn, updated_at: new Date().toISOString() }).eq("deal_id", l.deal.id);

  let paymentsCreated = 0;
  const { count } = await supabase.from("payments").select("id", { count: "exact", head: true }).eq("deal_id", l.deal.id);
  if ((count ?? 0) === 0) {
    const rows = paymentRowsByTerms({ terms, cashInr: l.totals.cashInr, eventStart: start, eventEnd: end, dues: readPaymentDues(ctx.event.model_assumptions) }).map((r) => ({ deal_id: l.deal.id, amount_inr: r.amountInr, due_date: r.dueOn, phase: r.phase, note: r.note }));
    if (rows.length > 0) {
      const ins = await supabase.from("payments").insert(rows);
      if (ins.error) warnings.push(`The payment rows couldn't be created (${ins.error.message.slice(0, 80)}).`);
      else paymentsCreated = rows.length;
    }
  }
  if (catalogIds.length > 0) {
    const sold = await supabase.from("deliverable_catalog").update({ sold: true, sold_to: l.brand.id }).in("id", catalogIds);
    if (sold.error) warnings.push(`The catalog items couldn't be marked sold (${sold.error.message.slice(0, 80)}).`);
  }
  return { paymentsCreated, warnings };
}

/** The company detail plus the facts the pipeline stepper needs. */
export async function getDetailWithPipeline(ctx: Ctx, brandId: string): Promise<CompanyDetail> {
  const detail = await getCompanyDetail(ctx, brandId);
  let pipeline: PipelineFacts | undefined;
  try {
    const l = await load(ctx, brandId);
    pipeline = { crmStatus: detail.crmStatus, dealStage: l.stage, itemCount: l.totals.count, paymentTerms: l.terms, termsStatus: String(l.deal.terms_status ?? "auto") };
  } catch {
    pipeline = undefined; // no deal yet, or the migration is missing
  }
  return { ...detail, pipeline };
}