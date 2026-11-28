import { getServiceClient } from "../client";
import { NotFoundError, ValidationError } from "../errors";
import { assertWritable, requireHead } from "../guards";
import type { Ctx } from "../../types";
import { normName } from "../../model/derive";
import { buildScorecard, festTiming, type Scorecard, type ScoreInput, type Timing } from "../../model/peerfest";
import { getLeadsBoard } from "./head-a-leads";
import { fetchAll } from "./page";
import { coordinatorsOf, listTeam } from "./team";

type Row = Record<string, unknown>;

const text = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const dateOnly = (v: unknown): string | null => text(v)?.slice(0, 10) ?? null;

export type SponsorRow = {
  id: string;
  brandName: string;
  sector: string | null;
  sponsorTier: string | null;
  year: number | null;
  sourceUrl: string | null;
  evidenceNote: string | null;
  status: string;
  isSimulated: boolean;
};

export type FestRow = {
  id: string;
  name: string;
  institution: string;
  city: string;
  tier: string;
  startsOn: string | null;
  endsOn: string | null;
  timing: Timing | null;
  sponsorPageUrl: string | null;
  researchStatus: string;
  researcherId: string | null;
  researcherName: string | null;
  sponsorsFound: number;
  leadsCreated: number;
  notes: string | null;
  updatedAt: string | null;
  sponsors: SponsorRow[];
};

export type PeerBoard = { fests: FestRow[]; researchers: { id: string; name: string }[]; scorecard: Scorecard };

export async function getPeerFestBoard(ctx: Ctx): Promise<PeerBoard> {
  requireHead(ctx);
  const [fests, sponsorsAll, cands, brands, events, team] = await Promise.all([
    fetchAll<Row>("peer_fests", "id, name, institution, city, tier, starts_on, ends_on, sponsor_page_url, research_status, researcher_id, sponsors_found, notes, updated_at", { event_id: ctx.eventId }),
    fetchAll<Row>("peer_fest_sponsors", "id, peer_fest_id, brand_name, sector, sponsor_tier, year, source_url, evidence_note, status, is_simulated", {}),
    fetchAll<Row>("lead_candidates", "peer_sponsor_id", { event_id: ctx.eventId }),
    fetchAll<Row>("brands", "id, peer_fest_id, first_outreach_at, first_response_at, crm_status", { event_id: ctx.eventId }),
    fetchAll<Row>("status_events", "brand_id, to_status", { event_id: ctx.eventId }),
    listTeam(ctx.eventId),
  ]);
  const nameOf = new Map(team.map((m) => [m.id, m.name]));
  const festIds = new Set(fests.map((f) => String(f.id)));
  const sponsors = sponsorsAll.filter((s) => festIds.has(String(s.peer_fest_id)));
  const leadSponsorIds = new Set(cands.map((c) => text(c.peer_sponsor_id)).filter((x): x is string => x !== null));

  const rows = fests
    .map((f): FestRow => {
      const id = String(f.id);
      const mine = sponsors
        .filter((s) => String(s.peer_fest_id) === id)
        .map((s): SponsorRow => ({
          id: String(s.id),
          brandName: String(s.brand_name),
          sector: text(s.sector),
          sponsorTier: text(s.sponsor_tier),
          year: s.year === null || s.year === undefined ? null : Number(s.year),
          sourceUrl: text(s.source_url),
          evidenceNote: text(s.evidence_note),
          status: String(s.status),
          isSimulated: Boolean(s.is_simulated),
        }))
        .sort((a, b) => a.brandName.localeCompare(b.brandName));
      const startsOn = dateOnly(f.starts_on);
      const researcherId = text(f.researcher_id);
      return {
        id,
        name: String(f.name),
        institution: String(f.institution),
        city: String(f.city),
        tier: String(f.tier),
        startsOn,
        endsOn: dateOnly(f.ends_on),
        timing: festTiming(startsOn),
        sponsorPageUrl: text(f.sponsor_page_url),
        researchStatus: String(f.research_status),
        researcherId,
        researcherName: researcherId ? (nameOf.get(researcherId) ?? null) : null,
        sponsorsFound: mine.length,
        leadsCreated: mine.filter((s) => leadSponsorIds.has(s.id)).length,
        notes: text(f.notes),
        updatedAt: text(f.updated_at),
        sponsors: mine,
      };
    })
    .sort((a, b) => (a.startsOn ?? "9999").localeCompare(b.startsOn ?? "9999") || a.name.localeCompare(b.name));

  const reached = new Set(events.filter((e) => e.to_status === "prospective" || e.to_status === "converted").map((e) => String(e.brand_id)));
  const input: ScoreInput[] = brands
    .filter((b) => text(b.peer_fest_id) !== null)
    .map((b) => ({
      festId: String(b.peer_fest_id),
      outreached: text(b.first_outreach_at) !== null,
      responded: text(b.first_response_at) !== null,
      proposal: reached.has(String(b.id)),
      signed: b.crm_status === "converted",
    }));

  return {
    fests: rows,
    researchers: coordinatorsOf(team).map((m) => ({ id: m.id, name: m.name })),
    scorecard: buildScorecard(input, rows.map((r) => ({ id: r.id, name: r.name, timing: r.timing }))),
  };
}

export type FestInput = {
  name: string;
  institution: string;
  city: string;
  tier: "iit" | "iim" | "other";
  startsOn: string | null;
  endsOn: string | null;
  sponsorPageUrl: string | null;
  researchStatus: "todo" | "researching" | "done";
  researcherId: string | null;
  notes: string | null;
};
export type FestPatch = { [K in keyof FestInput]?: FestInput[K] | undefined };

const COLUMNS: [keyof FestInput, string][] = [
  ["name", "name"], ["institution", "institution"], ["city", "city"], ["tier", "tier"],
  ["startsOn", "starts_on"], ["endsOn", "ends_on"], ["sponsorPageUrl", "sponsor_page_url"],
  ["researchStatus", "research_status"], ["researcherId", "researcher_id"], ["notes", "notes"],
];

async function checkResearcher(ctx: Ctx, id: string | null | undefined): Promise<void> {
  if (!id) return;
  const team = await listTeam(ctx.eventId);
  if (!team.some((m) => m.id === id)) throw new ValidationError("Unknown researcher.");
}

function checkDates(start: string | null | undefined, end: string | null | undefined): void {
  if (start && end && end < start) throw new ValidationError("The end date is before the start date.");
}

export async function createFest(ctx: Ctx, input: FestInput): Promise<string> {
  requireHead(ctx);
  assertWritable(ctx);
  checkDates(input.startsOn, input.endsOn);
  await checkResearcher(ctx, input.researcherId);
  const row: Row = { event_id: ctx.eventId, sponsors_found: 0, updated_at: new Date().toISOString() };
  for (const [k, col] of COLUMNS) row[col] = input[k];
  const { data, error } = await getServiceClient().from("peer_fests").insert(row).select("id").single();
  if (error) throw new Error(`peer_fests: ${error.message}`);
  return String(data.id);
}

export async function updateFest(ctx: Ctx, id: string, patch: FestPatch): Promise<void> {
  requireHead(ctx);
  assertWritable(ctx);
  const sb = getServiceClient();
  const found = await sb.from("peer_fests").select("id, starts_on, ends_on").eq("id", id).eq("event_id", ctx.eventId).maybeSingle();
  if (found.error) throw new Error(`peer_fests: ${found.error.message}`);
  if (!found.data) throw new NotFoundError("Peer fest not found.");
  checkDates(patch.startsOn !== undefined ? patch.startsOn : dateOnly(found.data.starts_on), patch.endsOn !== undefined ? patch.endsOn : dateOnly(found.data.ends_on));
  await checkResearcher(ctx, patch.researcherId);
  const update: Row = {};
  for (const [k, col] of COLUMNS) {
    const v = patch[k];
    if (v !== undefined) update[col] = v;
  }
  if (Object.keys(update).length === 0) throw new ValidationError("Nothing to update.");
  update.updated_at = new Date().toISOString();
  const res = await sb.from("peer_fests").update(update).eq("id", id);
  if (res.error) throw new Error(`peer_fests: ${res.error.message}`);
}

/** Turns one sponsor into a lead candidate (channel and signal peer_fest). Existing companies are marked duplicate. */
export async function makeLead(ctx: Ctx, sponsorId: string): Promise<{ duplicate: boolean }> {
  requireHead(ctx);
  assertWritable(ctx);
  const sb = getServiceClient();
  const found = await sb
    .from("peer_fest_sponsors")
    .select("id, brand_name, sector, status, peer_fest_id, peer_fests(name, event_id)")
    .eq("id", sponsorId)
    .maybeSingle();
  if (found.error) throw new Error(`peer_fest_sponsors: ${found.error.message}`);
  const s = found.data as Row | null;
  const fest = (Array.isArray(s?.peer_fests) ? (s?.peer_fests as Row[])[0] : s?.peer_fests) as Row | null | undefined;
  if (!s || !fest || fest.event_id !== ctx.eventId) throw new NotFoundError("Sponsor not found.");
  if (s.status !== "new") throw new ValidationError(`This sponsor is already ${String(s.status)}.`);

  const board = await getLeadsBoard(ctx);
  if (board.existingNames.includes(normName(String(s.brand_name)))) {
    const up = await sb.from("peer_fest_sponsors").update({ status: "duplicate" }).eq("id", sponsorId);
    if (up.error) throw new Error(`peer_fest_sponsors: ${up.error.message}`);
    return { duplicate: true };
  }
  const ins = await sb.from("lead_candidates").insert({
    event_id: ctx.eventId,
    brand_name: s.brand_name,
    sector: s.sector ?? null,
    source_channel: "peer_fest",
    signal_tag: "peer_fest",
    peer_sponsor_id: sponsorId,
    status: "new",
    import_batch: `peer-fest: ${String(fest.name)}`.slice(0, 120),
  });
  if (ins.error) throw new Error(`lead_candidates: ${ins.error.message}`);
  const up = await sb.from("peer_fest_sponsors").update({ status: "imported" }).eq("id", sponsorId);
  if (up.error) throw new Error(`peer_fest_sponsors: ${up.error.message}`);
  await sb.from("peer_fests").update({ updated_at: new Date().toISOString() }).eq("id", String(s.peer_fest_id));
  return { duplicate: false };
}