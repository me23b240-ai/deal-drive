import { getServiceClient } from "../client";
import { NotFoundError, ValidationError } from "../errors";
import { assertWritable, requireHead } from "../guards";
import type { Ctx } from "../../types";
import { AGENCY_COMMISSION_PCT, LEAD_CHANNELS, channelToInitiative } from "../../domain/channels";
import { isSignalTag } from "../../domain/signals";
import { normName } from "../../model/derive";
import { fetchAll } from "./page";
import { getBrandRows } from "./plan";
import { coordinatorsOf, listTeam } from "./team";

type Row = Record<string, unknown>;

export const QUEUE_SOFT_CAP = 8;
const QUEUE = ["to_contact", "send_mail"];

export type CandidateRow = {
  id: string;
  brandName: string;
  sector: string | null;
  contactName: string | null;
  contactEmail: string | null;
  channel: string;
  signal: string | null;
  bet: string;
  status: string;
  commissionPct: number;
  importBatch: string | null;
};
export type CoordLoad = { id: string; name: string; queue: number };
export type LeadsBoard = {
  candidates: CandidateRow[];
  coordinators: CoordLoad[];
  existingNames: string[];
  counts: Record<string, number>;
};

const text = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));

export async function getLeadsBoard(ctx: Ctx): Promise<LeadsBoard> {
  requireHead(ctx);
  const [rows, brands, team] = await Promise.all([
    fetchAll<Row>("lead_candidates", "id, brand_name, sector, contact_name, contact_email, source_channel, signal_tag, status, import_batch, created_at", { event_id: ctx.eventId }),
    getBrandRows(ctx),
    listTeam(ctx.eventId),
  ]);
  const candidates = rows
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((r): CandidateRow => {
      const channel = String(r.source_channel);
      const signal = text(r.signal_tag);
      return {
        id: String(r.id),
        brandName: String(r.brand_name),
        sector: text(r.sector),
        contactName: text(r.contact_name),
        contactEmail: text(r.contact_email),
        channel,
        signal,
        bet: channelToInitiative(channel, signal),
        status: String(r.status),
        commissionPct: channel === "agency" || signal === "agency" ? AGENCY_COMMISSION_PCT : 0,
        importBatch: text(r.import_batch),
      };
    });
  const counts: Record<string, number> = {};
  for (const c of candidates) counts[c.status] = (counts[c.status] ?? 0) + 1;
  const coordinators = coordinatorsOf(team).map((m) => ({
    id: m.id,
    name: m.name,
    queue: brands.filter((b) => b.owner_id === m.id && b.crm_status !== null && QUEUE.includes(b.crm_status) && !b.first_outreach_at).length,
  }));
  return {
    candidates,
    coordinators,
    existingNames: [...new Set([...brands.map((b) => normName(b.name)), ...candidates.map((c) => normName(c.brandName))])],
    counts,
  };
}

export type ImportRow = {
  brandName: string;
  sector?: string | undefined;
  contactName?: string | undefined;
  contactEmail?: string | undefined;
  contactTitle?: string | undefined;
  channel: string;
  signal?: string | null | undefined;
};

export async function importLeads(ctx: Ctx, rows: ImportRow[], batch: string): Promise<{ added: number; duplicates: number; invalid: number }> {
  requireHead(ctx);
  assertWritable(ctx);
  const board = await getLeadsBoard(ctx);
  const seen = new Set(board.existingNames);
  const out: Row[] = [];
  let duplicates = 0;
  let invalid = 0;
  for (const r of rows) {
    const channel = r.channel;
    const signal = r.signal && isSignalTag(r.signal) ? r.signal : null;
    if (!(LEAD_CHANNELS as readonly string[]).includes(channel) || !r.brandName.trim()) {
      invalid += 1;
      continue;
    }
    const key = normName(r.brandName);
    const dup = seen.has(key);
    seen.add(key);
    if (dup) duplicates += 1;
    out.push({
      event_id: ctx.eventId,
      brand_name: r.brandName.trim(),
      sector: r.sector?.trim() || null,
      contact_name: r.contactName?.trim() || null,
      contact_email: r.contactEmail?.trim() || null,
      contact_title: r.contactTitle?.trim() || null,
      source_channel: channel,
      signal_tag: signal,
      status: dup ? "duplicate" : "new",
      import_batch: batch.slice(0, 120),
    });
  }
  if (out.length > 0) {
    const { error } = await getServiceClient().from("lead_candidates").insert(out);
    if (error) throw new Error(`lead_candidates: ${error.message}`);
  }
  return { added: out.length - duplicates, duplicates, invalid };
}

/** One lead at a time: creates the brand and marks the candidate assigned in a single database function. */
export async function assignLead(ctx: Ctx, candidateId: string, ownerId: string): Promise<string> {
  requireHead(ctx);
  assertWritable(ctx);
  const supabase = getServiceClient();
  const found = await supabase.from("lead_candidates").select("id, source_channel, signal_tag").eq("id", candidateId).eq("event_id", ctx.eventId).maybeSingle();
  if (found.error) throw new Error(`lead_candidates: ${found.error.message}`);
  if (!found.data) throw new NotFoundError("Lead not found.");
  const bet = channelToInitiative(String(found.data.source_channel), text(found.data.signal_tag));
  const { data, error } = await supabase.rpc("assign_lead", { p_candidate: candidateId, p_owner: ownerId, p_bet: bet });
  if (error) throw new ValidationError(error.message);
  return String(data);
}

export async function setCandidateStatus(ctx: Ctx, candidateId: string, status: "new" | "not_fit"): Promise<void> {
  requireHead(ctx);
  assertWritable(ctx);
  const from = status === "not_fit" ? "new" : "not_fit";
  const res = await getServiceClient().from("lead_candidates").update({ status }).eq("id", candidateId).eq("event_id", ctx.eventId).eq("status", from).select("id");
  if (res.error) throw new Error(`lead_candidates: ${res.error.message}`);
  if ((res.data ?? []).length === 0) throw new ValidationError("This lead cannot change status now.");
}