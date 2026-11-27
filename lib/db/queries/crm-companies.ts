import { getServiceClient } from "@/lib/db/client";
import { scopeOwner } from "@/lib/db/guards";
import { businessDaysBetween, toIstDate } from "@/lib/domain/bizdays";
import type { Ctx } from "@/lib/types";
import { getHolidays } from "./holidays";
import { fetchAll, num } from "./page";
import { getNeedsUpdate } from "./views";

export type CrmFilters = {
  status?: string;
  channel?: string;
  tier?: string;
  needsUpdate?: boolean;
  q?: string;
  sort?: "company" | "status" | "amount" | "follow_up" | "last_update";
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type CrmRow = {
  id: string;
  name: string;
  crmStatus: string;
  channel: string | null;
  tier: string | null;
  amountInr: number;
  nextFollowUp: string | null;
  lastTouchAt: string | null;
  idleBdays: number;
  flag: "idle" | "follow_up_due" | null;
  poc: { name: string; jobTitle: string | null } | null;
};

export type CrmPage = { rows: CrmRow[]; total: number; page: number; pageSize: number };

async function firstContacts(brandIds: string[]): Promise<Map<string, { name: string; jobTitle: string | null }>> {
  const supabase = getServiceClient();
  const out = new Map<string, { name: string; jobTitle: string | null }>();
  for (let i = 0; i < brandIds.length; i += 100) {
    const { data, error } = await supabase
      .from("contacts")
      .select("brand_id, name, job_title, created_at")
      .in("brand_id", brandIds.slice(i, i + 100))
      .order("created_at");
    if (error) throw new Error(`contacts: ${error.message}`);
    for (const r of data ?? []) {
      const key = String(r.brand_id);
      if (!out.has(key)) out.set(key, { name: String(r.name), jobTitle: (r.job_title as string | null) ?? null });
    }
  }
  return out;
}

/** The coordinator's own companies (the head may pass an owner). Filtering, sorting and paging happen here. */
export async function listCompanies(ctx: Ctx, filters: CrmFilters = {}, ownerId?: string | null): Promise<CrmPage> {
  const owner = scopeOwner(ctx, ownerId);
  const eq: Record<string, string> = { event_id: ctx.eventId };
  if (owner) eq.owner_id = owner;
  const [brands, holidays, needs] = await Promise.all([
    fetchAll<Record<string, unknown>>(
      "brands",
      "id, name, crm_status, source_channel, company_tier, approx_amount_inr, next_follow_up, last_touch_at, created_at",
      eq,
    ),
    getHolidays(ctx.eventId),
    getNeedsUpdate(ctx, ownerId),
  ]);
  const live = brands.filter((b) => b.crm_status !== null);
  const flagOf = new Map(needs.map((n) => [n.brand_id, n.reason]));
  const contacts = await firstContacts(live.map((b) => String(b.id)));

  let rows: CrmRow[] = live.map((b) => {
    const id = String(b.id);
    const touch = (b.last_touch_at as string | null) ?? null;
    const from = toIstDate(touch ?? String(b.created_at));
    return {
      id,
      name: String(b.name),
      crmStatus: String(b.crm_status),
      channel: (b.source_channel as string | null) ?? null,
      tier: (b.company_tier as string | null) ?? null,
      amountInr: num(b.approx_amount_inr),
      nextFollowUp: (b.next_follow_up as string | null) ?? null,
      lastTouchAt: touch,
      idleBdays: businessDaysBetween(from, ctx.todayIst, holidays),
      flag: flagOf.get(id) ?? null,
      poc: contacts.get(id) ?? null,
    };
  });

  if (filters.status) rows = rows.filter((r) => r.crmStatus === filters.status);
  if (filters.channel) rows = rows.filter((r) => r.channel === filters.channel);
  if (filters.tier) rows = rows.filter((r) => r.tier === filters.tier);
  if (filters.needsUpdate) rows = rows.filter((r) => r.flag !== null);
  const q = (filters.q ?? "").trim().toLowerCase();
  if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || (r.poc?.name ?? "").toLowerCase().includes(q));

  const dir = filters.dir === "asc" ? 1 : -1;
  const key = filters.sort ?? "last_update";
  const cmp = (a: CrmRow, b: CrmRow): number => {
    switch (key) {
      case "company": return a.name.localeCompare(b.name);
      case "status": return a.crmStatus.localeCompare(b.crmStatus);
      case "amount": return a.amountInr - b.amountInr;
      case "follow_up": return (a.nextFollowUp ?? "9999").localeCompare(b.nextFollowUp ?? "9999");
      default: return a.idleBdays - b.idleBdays;
    }
  };
  rows.sort((a, b) => dir * cmp(a, b) || a.name.localeCompare(b.name));

  const pageSize = Math.max(1, Math.min(100, filters.pageSize ?? 25));
  const page = Math.max(1, filters.page ?? 1);
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize };
}