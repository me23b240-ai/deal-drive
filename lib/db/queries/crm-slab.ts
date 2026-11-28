import { getServiceClient } from "@/lib/db/client";
import { assertWritable } from "@/lib/db/guards";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/db/errors";
import { PAYMENT_TERMS, type PaymentTerms } from "@/lib/domain/payments";
import { evaluateSlab, readSlabSettings, type CompetingDeal, type SlabFlag, type SlabItem, type SlabSettings } from "@/lib/domain/slab";
import type { Ctx } from "@/lib/types";
import { fetchAll, num } from "./page";
import { listTeam } from "./team";

export type CatalogRow = { id: string; category: string; name: string; priceMinInr: number; priceMaxInr: number; soldElsewhere: boolean; ugc: boolean };
export type PackageRow = { id: string; name: string; priceInr: number; headline: string | null };
export type CreatorOption = { id: string; label: string; rateInr: number | null };

export type SlabLine = {
  key: string;
  catalogId: string | null;
  packageId: string | null;
  creatorId: string | null;
  name: string;
  category: string | null;
  qty: number;
  unitPriceInr: number;
  inKind: boolean;
  isCustom: boolean;
  isUgc: boolean;
  priceMinInr: number | null;
  soldElsewhere: boolean;
};

export type SlabState = {
  brand: { id: string; name: string; sector: string | null; crmStatus: string };
  deal: { id: string; stage: string; terms: PaymentTerms; termsStatus: string; proposedInr: number; locked: boolean };
  lines: SlabLine[];
  discountInr: number;
  catalog: CatalogRow[];
  packages: PackageRow[];
  creators: CreatorOption[];
  competing: CompetingDeal[];
  settings: SlabSettings;
  today: string;
};

export type SlabLineInput = {
  catalogId?: string | null;
  packageId?: string | null;
  creatorId?: string | null;
  name?: string | null;
  qty: number;
  unitPriceInr: number;
  inKind: boolean;
};

const UGC = /ugc|creator|influencer|reel/i;
const OPEN_STAGES = ["prospecting", "contacted", "proposal_sent", "negotiating"];
const COMPETING_STAGES = ["negotiating", "mou_sent", "partner_confirmed"];
const MIGRATION_HINT = "The slab tables aren't ready yet. Run the database migration, then reload.";

async function loadBrandAndDeal(ctx: Ctx, brandId: string) {
  const supabase = getServiceClient();
  const { data: b, error } = await supabase.from("brands").select("id, event_id, name, sector, crm_status, owner_id").eq("id", brandId).maybeSingle();
  if (error) throw new Error(`brands: ${error.message}`);
  if (!b || b.event_id !== ctx.eventId || !b.crm_status) throw new NotFoundError("Company not found.");
  if (ctx.role === "coordinator" && !ctx.isCloser && b.owner_id !== ctx.memberId) throw new ForbiddenError("This company belongs to another coordinator.");
  const { data: deals, error: dErr } = await supabase
    .from("deals")
    .select("id, stage, proposed_value_inr, payment_terms, terms_status, owner_id")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (dErr) throw new Error(dErr.message.includes("terms_status") ? MIGRATION_HINT : `deals: ${dErr.message}`);
  const deal = deals?.[0];
  if (!deal) throw new ValidationError("This company has no deal yet. Move it to Prospective first, which opens its deal.");
  return { brand: b, deal };
}

const termsOf = (v: unknown): PaymentTerms => (PAYMENT_TERMS as string[]).includes(String(v)) ? (String(v) as PaymentTerms) : "100_0";

async function loadCatalog(ctx: Ctx, brandId: string, dealId: string): Promise<CatalogRow[]> {
  const rows = await fetchAll<Record<string, unknown>>("deliverable_catalog", "id, category, name, price_min_inr, price_max_inr, sold, sold_to", { event_id: ctx.eventId });
  return rows
    .map((r) => ({
      id: String(r.id),
      category: String(r.category ?? ""),
      name: String(r.name ?? ""),
      priceMinInr: num(r.price_min_inr),
      priceMaxInr: num(r.price_max_inr),
      soldElsewhere: r.sold === true && r.sold_to !== brandId && r.sold_to !== dealId,
      ugc: UGC.test(`${r.category ?? ""} ${r.name ?? ""}`),
    }))
    .sort((a, b) => Number(b.ugc) - Number(a.ugc) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

async function loadCreators(ctx: Ctx): Promise<{ id: string; handle: string; name: string | null; rate: number | null }[]> {
  const { data, error } = await getServiceClient().from("creators").select("id, handle, name, rate_inr").eq("event_id", ctx.eventId).eq("status", "confirmed");
  if (error) return []; // the roster table may not exist yet
  return (data ?? []).map((c) => ({ id: String(c.id), handle: String(c.handle), name: typeof c.name === "string" ? c.name : null, rate: c.rate_inr === null ? null : num(c.rate_inr) }));
}

export async function getSlabState(ctx: Ctx, brandId: string): Promise<SlabState> {
  const { brand, deal } = await loadBrandAndDeal(ctx, brandId);
  const supabase = getServiceClient();
  const dealId = String(deal.id);
  const [catalog, packagesRaw, creators, itemsRes, team, brands, deals] = await Promise.all([
    loadCatalog(ctx, brandId, dealId),
    fetchAll<Record<string, unknown>>("packages", "id, name, price_inr, headline, tier_order", { event_id: ctx.eventId }),
    loadCreators(ctx),
    supabase.from("deal_items").select("id, catalog_id, creator_id, name, category, qty, unit_price_inr, in_kind, is_custom, is_ugc, created_at").eq("deal_id", dealId).order("created_at"),
    listTeam(ctx.eventId),
    fetchAll<Record<string, unknown>>("brands", "id, name, sector", { event_id: ctx.eventId }),
    fetchAll<Record<string, unknown>>("deals", "id, brand_id, owner_id, stage", { event_id: ctx.eventId }),
  ]);
  if (itemsRes.error) throw new Error(itemsRes.error.message.includes("deal_items") ? MIGRATION_HINT : `deal_items: ${itemsRes.error.message}`);

  const packages: PackageRow[] = packagesRaw
    .sort((a, b) => num(a.tier_order) - num(b.tier_order))
    .map((p) => ({ id: String(p.id), name: String(p.name), priceInr: num(p.price_inr), headline: typeof p.headline === "string" ? p.headline : null }));
  const byCatalog = new Map(catalog.map((c) => [c.id, c]));
  const byPackageName = new Map(packages.map((p) => [`${p.name} package`, p]));

  let discountInr = 0;
  const lines: SlabLine[] = [];
  for (const r of itemsRes.data ?? []) {
    if (r.category === "Discount") {
      discountInr += num(r.unit_price_inr);
      continue;
    }
    const cat = r.catalog_id ? byCatalog.get(String(r.catalog_id)) : undefined;
    const pkg = r.category === "Package" ? byPackageName.get(String(r.name)) : undefined;
    lines.push({
      key: String(r.id),
      catalogId: r.catalog_id ? String(r.catalog_id) : null,
      packageId: pkg?.id ?? null,
      creatorId: r.creator_id ? String(r.creator_id) : null,
      name: String(r.name),
      category: typeof r.category === "string" ? r.category : null,
      qty: num(r.qty) || 1,
      unitPriceInr: num(r.unit_price_inr),
      inKind: r.in_kind === true,
      isCustom: r.is_custom === true,
      isUgc: r.is_ugc === true,
      priceMinInr: cat ? cat.priceMinInr : pkg ? pkg.priceInr : null,
      soldElsewhere: cat?.soldElsewhere ?? false,
    });
  }

  const sector = (brand.sector ?? "").toString().toLowerCase();
  const sameSector = new Map(brands.filter((x) => sector && String(x.sector ?? "").toLowerCase() === sector && x.id !== brand.id).map((x) => [String(x.id), String(x.name)]));
  const ownerName = new Map(team.map((m) => [m.id, m.name]));
  const competing: CompetingDeal[] = deals
    .filter((d) => d.id !== deal.id && sameSector.has(String(d.brand_id)) && COMPETING_STAGES.includes(String(d.stage)))
    .map((d) => ({ company: sameSector.get(String(d.brand_id)) ?? "Another company", ownerName: d.owner_id ? ownerName.get(String(d.owner_id)) ?? null : null, stage: String(d.stage) }));

  return {
    brand: { id: String(brand.id), name: String(brand.name), sector: brand.sector ? String(brand.sector) : null, crmStatus: String(brand.crm_status) },
    deal: {
      id: dealId,
      stage: String(deal.stage),
      terms: termsOf(deal.payment_terms),
      termsStatus: String(deal.terms_status ?? "auto"),
      proposedInr: num(deal.proposed_value_inr),
      locked: !OPEN_STAGES.includes(String(deal.stage)),
    },
    lines,
    discountInr,
    catalog,
    packages,
    creators: creators.map((c) => ({ id: c.id, label: c.name ? `${c.name} (@${c.handle})` : `@${c.handle}`, rateInr: c.rate })),
    competing,
    settings: readSlabSettings(ctx.event.model_assumptions),
    today: ctx.todayIst,
  };
}

export type SaveSlabResult = { totalInr: number; termsStatus: "auto" | "pending_approval"; flags: SlabFlag[]; preFestCashInr: number };

/** Rebuilds every line from the database (names, minimum prices, sold status), so the browser can only change quantity, price and in-kind. */
export async function saveSlab(ctx: Ctx, input: { brandId: string; items: SlabLineInput[]; discountInr: number; terms: PaymentTerms }): Promise<SaveSlabResult> {
  assertWritable(ctx);
  const state = await getSlabState(ctx, input.brandId);
  if (state.deal.locked) throw new ValidationError("This slab is locked because the MoU has been sent.");
  if (input.items.length === 0) throw new ValidationError("Add at least one deliverable.");
  if (input.items.length > 40) throw new ValidationError("A slab can have at most 40 lines.");

  const catalog = new Map(state.catalog.map((c) => [c.id, c]));
  const packages = new Map(state.packages.map((p) => [p.id, p]));
  const creators = new Map(state.creators.map((c) => [c.id, c]));

  const built: { item: SlabItem; row: Record<string, unknown> }[] = input.items.map((i) => {
    if (!Number.isInteger(i.qty) || i.qty < 1 || i.qty > 50) throw new ValidationError("Quantity must be a whole number from 1 to 50.");
    if (!Number.isInteger(i.unitPriceInr) || i.unitPriceInr < 0 || i.unitPriceInr > 100_000_000) throw new ValidationError("Check the price on each line.");
    const base = { qty: i.qty, unit_price_inr: i.unitPriceInr, in_kind: i.inKind };
    if (i.catalogId) {
      const c = catalog.get(i.catalogId);
      if (!c) throw new ValidationError("A catalog item on this slab no longer exists.");
      return {
        item: { name: c.name, qty: i.qty, unitPriceInr: i.unitPriceInr, inKind: i.inKind, isCustom: false, priceMinInr: c.priceMinInr, soldElsewhere: c.soldElsewhere },
        row: { ...base, catalog_id: c.id, creator_id: null, name: c.name, category: c.category, is_custom: false, is_ugc: c.ugc },
      };
    }
    if (i.packageId) {
      const p = packages.get(i.packageId);
      if (!p) throw new ValidationError("A package on this slab no longer exists.");
      const name = `${p.name} package`;
      return {
        item: { name, qty: i.qty, unitPriceInr: i.unitPriceInr, inKind: i.inKind, isCustom: false, priceMinInr: p.priceInr, soldElsewhere: false },
        row: { ...base, catalog_id: null, creator_id: null, name, category: "Package", is_custom: false, is_ugc: false },
      };
    }
    if (i.creatorId) {
      const c = creators.get(i.creatorId);
      if (!c) throw new ValidationError("Only confirmed creators can be added to a slab.");
      const name = `Creator: ${c.label}`;
      return {
        item: { name, qty: i.qty, unitPriceInr: i.unitPriceInr, inKind: i.inKind, isCustom: true, priceMinInr: null, soldElsewhere: false },
        row: { ...base, catalog_id: null, creator_id: c.id, name, category: "Creator", is_custom: true, is_ugc: true },
      };
    }
    const name = (i.name ?? "").trim();
    if (!name || name.length > 120) throw new ValidationError("Give each custom line a name (up to 120 characters).");
    return {
      item: { name, qty: i.qty, unitPriceInr: i.unitPriceInr, inKind: i.inKind, isCustom: true, priceMinInr: null, soldElsewhere: false },
      row: { ...base, catalog_id: null, creator_id: null, name, category: "Custom", is_custom: true, is_ugc: false },
    };
  });

  if (!Number.isInteger(input.discountInr) || input.discountInr < 0) throw new ValidationError("The discount must be zero or more.");
  const result = evaluateSlab({
    items: built.map((b) => b.item),
    discountInr: input.discountInr,
    terms: input.terms,
    today: ctx.todayIst,
    sector: state.brand.sector,
    competing: state.competing,
    settings: state.settings,
  });
  if (result.blocked.length > 0) throw new ValidationError(result.blocked[0] ?? "This slab can't be saved.");
  if (result.totalInr <= 0) throw new ValidationError("The slab total must be above zero.");

  const supabase = getServiceClient();
  const rows: Record<string, unknown>[] = built.map((b) => ({ deal_id: state.deal.id, ...b.row }));
  if (input.discountInr > 0) {
    rows.push({ deal_id: state.deal.id, catalog_id: null, creator_id: null, name: "Bundle discount", category: "Discount", qty: 1, unit_price_inr: input.discountInr, in_kind: false, is_custom: true, is_ugc: false });
  }
  const { data: old, error: oErr } = await supabase.from("deal_items").select("id").eq("deal_id", state.deal.id);
  if (oErr) throw new Error(`deal_items: ${oErr.message}`);
  const { error: iErr } = await supabase.from("deal_items").insert(rows);
  if (iErr) throw new Error(`deal_items: ${iErr.message}`);
  const oldIds = (old ?? []).map((r) => r.id);
  if (oldIds.length > 0) {
    const { error: dErr } = await supabase.from("deal_items").delete().in("id", oldIds);
    if (dErr) throw new Error(`deal_items: ${dErr.message}`);
  }

  const { error: uErr } = await supabase
    .from("deals")
    .update({ proposed_value_inr: result.totalInr, payment_terms: input.terms, terms_status: result.termsStatus, approval_note: result.flags.map((f) => f.text).join(" ") || null })
    .eq("id", state.deal.id);
  if (uErr) throw new Error(`deals: ${uErr.message}`);
  const { error: bErr } = await supabase.from("brands").update({ approx_amount_inr: result.totalInr }).eq("id", state.brand.id);
  if (bErr) throw new Error(`brands: ${bErr.message}`);

  return { totalInr: result.totalInr, termsStatus: result.termsStatus, flags: result.flags, preFestCashInr: result.preFestCashInr };
}