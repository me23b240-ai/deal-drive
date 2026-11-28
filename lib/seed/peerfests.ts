import { randomUUID } from "node:crypto";
import { getServiceClient } from "../db/client";
import { FESTS, SPONSORS } from "./constants/peerfests";

export type PeerFestSeedReport = { eventId: string; fests: number; sponsors: number; flaggedApprovals: number };

/** Replaces the peer fests of one event. Idempotent. Everything is simulated. */
export async function seedPeerFests(eventId = "saarang-2027", flagApprovals = false): Promise<PeerFestSeedReport> {
  const sb = getServiceClient();
  const ev = await sb.from("events").select("id").eq("id", eventId).maybeSingle();
  if (ev.error) throw new Error(`events: ${ev.error.message}`);
  if (!ev.data) throw new Error(`Event ${eventId} not found. Run npm run seed:saarang first.`);

  const team = await sb.from("team_members").select("id").eq("event_id", eventId).eq("role", "member").order("name");
  if (team.error) throw new Error(`team_members: ${team.error.message}`);
  const researchers = (team.data ?? []).map((r) => String(r.id));

  const del = await sb.from("peer_fests").delete().eq("event_id", eventId);
  if (del.error) throw new Error(`peer_fests: ${del.error.message}`);

  const ids = FESTS.map(() => randomUUID());
  const now = new Date().toISOString();
  const festRows = FESTS.map((f, i) => ({
    id: ids[i],
    event_id: eventId,
    name: f.name,
    institution: f.institution,
    city: f.city,
    tier: f.tier,
    starts_on: f.start,
    ends_on: f.end,
    sponsor_page_url: null,
    research_status: f.status,
    researcher_id: f.status === "todo" || researchers.length === 0 ? null : researchers[i % researchers.length],
    sponsors_found: SPONSORS.filter((s) => s.fest === i).length,
    notes: "Simulated research notes for the demo.",
    updated_at: now,
  }));
  const fi = await sb.from("peer_fests").insert(festRows);
  if (fi.error) throw new Error(`peer_fests: ${fi.error.message}`);

  const sponsorRows = SPONSORS.map((s) => ({
    peer_fest_id: ids[s.fest],
    brand_name: s.name,
    sector: s.sector,
    sponsor_tier: s.tier,
    year: s.year,
    source_url: null,
    evidence_note: "Simulated listing for the demo.",
    status: "new",
    is_simulated: true,
  }));
  const si = await sb.from("peer_fest_sponsors").insert(sponsorRows);
  if (si.error) throw new Error(`peer_fest_sponsors: ${si.error.message}`);

  let flagged = 0;
  if (flagApprovals) {
    const open = await sb
      .from("deals")
      .select("id")
      .eq("event_id", eventId)
      .in("stage", ["proposal_sent", "negotiating"])
      .order("proposed_value_inr", { ascending: false })
      .limit(2);
    if (open.error) throw new Error(`deals: ${open.error.message}`);
    for (const d of open.data ?? []) {
      const up = await sb.from("deals").update({ payment_terms: "50_50", terms_status: "pending_approval" }).eq("id", d.id);
      if (up.error) throw new Error(`deals: ${up.error.message}`);
      flagged += 1;
    }
  }
  return { eventId, fests: festRows.length, sponsors: sponsorRows.length, flaggedApprovals: flagged };
}