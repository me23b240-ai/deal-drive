import { randomUUID } from "node:crypto";
import { getServiceClient } from "../db/client";
import { insertChunks, wipeEvent } from "./db";
import { latestByEntity, n, parseCampusFest, s } from "./campusfest-parse";

export type LoadReport = {
  eventId: string;
  counts: Record<string, number>;
  removedDuplicates: { interactions: number; qualification: number; history: number };
  skipped: { orphanRows: number; afterCutoff: number; unknownOrigin: number };
};

const STALE_DEFAULTS: [string, number][] = [
  ["prospecting", 7],
  ["contacted", 7],
  ["proposal_sent", 7],
  ["negotiating", 5],
  ["no_reply_after_outreach", 5],
];

/**
 * Loads the CampusFest workbook into one event (original or working copy).
 * Parsing and validation happen BEFORE the wipe, so a bad file keeps the old data.
 */
export async function loadCampusFest(source: Buffer | string, eventId: string): Promise<LoadReport> {
  const p = await parseCampusFest(source);
  const asOfMs = Date.parse(p.asOf);
  const isSeed = eventId === "campusfest-2025";
  const sid = (id: string | null): string | null => (id && !isSeed ? `${eventId}:${id}` : id);

  await wipeEvent(eventId);

  const sb = getServiceClient();
  const { error: evError } = await sb.from("events").upsert(
    {
      id: eventId,
      name: `${p.event.name} (${isSeed ? "original" : "working copy"})`,
      starts_at: p.event.startsAt,
      ends_at: p.event.endsAt,
      currency: "INR",
      is_seed: isSeed,
      as_of: p.asOf,
      weekly_target_default: 10,
      model_assumptions: {},
    },
    { onConflict: "id" },
  );
  if (evError) throw new Error(`events: ${evError.message}`);

  const skipped = { orphanRows: 0, afterCutoff: 0, unknownOrigin: 0 };

  // team
  const team = new Map<string, { id: string; name: string }>();
  const addMember = (sid: string | null, name: string | null) => {
    if (!sid || team.has(sid)) return;
    team.set(sid, { id: randomUUID(), name: name ?? sid });
  };
  for (const r of p.brands) addMember(s(r, "owner_id"), s(r, "owner_name"));
  for (const r of p.campaigns) addMember(s(r, "owner_id"), s(r, "owner_name"));
  for (const r of p.history) addMember(s(r, "owner_id"), s(r, "owner_name"));
  const owner = (sid: string | null) => (sid ? team.get(sid)?.id ?? null : null);
  await insertChunks(
    "team_members",
    [...team.entries()].map(([sid, m]) => ({
      id: m.id, event_id: eventId, source_id: sid, name: m.name, role: "member", is_closer: false,
    })),
  );

  // campaigns
  const campaignIds = new Map<string, string>();
  for (const r of p.campaigns) campaignIds.set(s(r, "sponsor_campaign_id") ?? "", randomUUID());
  await insertChunks(
    "campaigns",
    p.campaigns.map((r) => ({
      id: campaignIds.get(s(r, "sponsor_campaign_id") ?? ""),
      event_id: eventId,
      source_id: s(r, "sponsor_campaign_id"),
      name: s(r, "campaign_name"),
      channel: s(r, "channel"),
      objective: s(r, "objective"),
      audience: s(r, "audience"),
      owner_id: owner(s(r, "owner_id")),
      planned_start: s(r, "planned_start_at"),
      planned_end: s(r, "planned_end_at"),
      kind: "channel",
    })),
  );

  // brands (qualification = latest version <= as_of)
  const latestQual = latestByEntity(p.qualification, "brand_id", asOfMs);
  const brandIds = new Map<string, string>();
  for (const r of p.brands) brandIds.set(s(r, "brand_id") ?? "", randomUUID());
  await insertChunks(
    "brands",
    p.brands.map((r) => {
      const bid = s(r, "brand_id") ?? "";
      const q = latestQual.get(bid);
      return {
        id: brandIds.get(bid),
        event_id: eventId,
        source_id: bid,
        name: s(r, "brand_name"),
        industry: s(r, "industry"),
        owner_id: owner(s(r, "owner_id")),
        qualification: q ? s(q, "qualification_status") : "unreviewed",
        created_at: s(r, "created_at"),
      };
    }),
  );

  // contacts
  const contactIds = new Map<string, string>();
  const contactRows: Record<string, unknown>[] = [];
  for (const r of p.contacts) {
    const brand = brandIds.get(s(r, "brand_id") ?? "");
    if (!brand) {
      skipped.orphanRows += 1;
      continue;
    }
    const id = randomUUID();
    contactIds.set(s(r, "contact_id") ?? "", id);
    contactRows.push({
      id, brand_id: brand, source_id: s(r, "contact_id"), name: s(r, "contact_name"),
      job_title: s(r, "job_title"), created_at: s(r, "created_at"),
    });
  }
  await insertChunks("contacts", contactRows);

  // activities (roots first so origin references resolve)
  const actIds = new Map<string, string>();
  for (const r of p.interactions) actIds.set(s(r, "interaction_id") ?? "", randomUUID());
  const activityRows: Record<string, unknown>[] = [];
  for (const r of p.interactions) {
    const brand = brandIds.get(s(r, "brand_id") ?? "");
    if (!brand) {
      skipped.orphanRows += 1;
      continue;
    }
    const at = Date.parse(s(r, "occurred_at") ?? "");
    if (Number.isNaN(at) || at > asOfMs) {
      skipped.afterCutoff += 1;
      continue;
    }
    const originSource = s(r, "origin_interaction_id");
    const origin = originSource ? actIds.get(originSource) ?? null : null;
    if (originSource && !origin) skipped.unknownOrigin += 1;
    activityRows.push({
      id: actIds.get(s(r, "interaction_id") ?? ""),
      event_id: eventId,
      source_id: s(r, "interaction_id"),
      brand_id: brand,
      contact_id: contactIds.get(s(r, "contact_id") ?? "") ?? null,
      campaign_id: campaignIds.get(s(r, "sponsor_campaign_id") ?? "") ?? null,
      owner_id: owner(s(r, "owner_id")),
      attempt_id: s(r, "attempt_id"),
      origin_activity_id: origin,
      event_type: s(r, "event_type"),
      outcome: s(r, "outcome"),
      summary: s(r, "summary"),
      personalised: false,
      occurred_at: s(r, "occurred_at"),
    });
  }
  activityRows.sort((a, b) => Number(a.origin_activity_id !== null) - Number(b.origin_activity_id !== null));
  await insertChunks("activities", activityRows);

  // qualification history (full history is kept; the latest version is already on brands)
  await insertChunks(
    "qualification_history",
    p.qualification.flatMap((r) => {
      const brand = brandIds.get(s(r, "brand_id") ?? "");
      if (!brand) return [];
      return [{
        id: randomUUID(),
        source_id: sid(s(r, "history_id")),
        brand_id: brand,
        campaign_id: campaignIds.get(s(r, "sponsor_campaign_id") ?? "") ?? null,
        status: s(r, "qualification_status"),
        reason: s(r, "reason"),
        effective_at: s(r, "effective_at"),
      }];
    }),
  );

  // deals (stage and values from the latest history version <= as_of)
  const latestOpp = latestByEntity(p.history, "opportunity_id", asOfMs);
  const dealIds = new Map<string, string>();
  const dealRows: Record<string, unknown>[] = [];
  for (const o of p.opportunities) {
    const oid = s(o, "opportunity_id") ?? "";
    const brand = brandIds.get(s(o, "brand_id") ?? "");
    if (!brand) {
      skipped.orphanRows += 1;
      continue;
    }
    const id = randomUUID();
    dealIds.set(oid, id);
    const h = latestOpp.get(oid);
    const stage = h ? s(h, "stage") : "prospecting";
    const signed = h && stage === "partner_confirmed" ? n(h, "confirmed_value_inr") : 0;
    const inKind = s(o, "support_type") === "in_kind";
    dealRows.push({
      id,
      event_id: eventId,
      source_id: oid,
      brand_id: brand,
      primary_contact_id: contactIds.get(s(o, "primary_contact_id") ?? "") ?? null,
      campaign_id: campaignIds.get(s(o, "sponsor_campaign_id") ?? "") ?? null,
      owner_id: h ? owner(s(h, "owner_id")) : null,
      name: s(o, "opportunity_name"),
      support_type: s(o, "support_type"),
      stage,
      proposed_value_inr: h ? n(h, "proposed_value_inr") : 0,
      signed_value_inr: signed,
      signed_cash_inr: inKind ? 0 : signed,
      signed_in_kind_inr: inKind ? signed : 0,
      stage_changed_at: h ? s(h, "effective_at") : s(o, "created_at"),
      created_at: s(o, "created_at"),
    });
  }
  await insertChunks("deals", dealRows);

  await insertChunks(
    "deal_history",
    p.history.flatMap((r) => {
      const deal = dealIds.get(s(r, "opportunity_id") ?? "");
      if (!deal) return [];
      return [{
        id: randomUUID(),
        source_id: sid(s(r, "history_id")),
        deal_id: deal,
        stage: s(r, "stage"),
        proposed_value_inr: n(r, "proposed_value_inr"),
        signed_value_inr: n(r, "confirmed_value_inr"),
        owner_id: owner(s(r, "owner_id")),
        effective_at: s(r, "effective_at"),
      }];
    }),
  );

  await insertChunks(
    "sponsor_activations",
    p.activations.flatMap((r) => {
      const brand = brandIds.get(s(r, "brand_id") ?? "");
      if (!brand) return [];
      return [{
        id: randomUUID(),
        source_id: s(r, "activation_id"),
        event_id: eventId,
        brand_id: brand,
        deal_id: dealIds.get(s(r, "opportunity_id") ?? "") ?? null,
        attendee_campaign_name: s(r, "attendee_campaign_name"),
        note: s(r, "activation_note"),
        linked_at: s(r, "linked_at"),
      }];
    }),
  );

  await insertChunks(
    "targets",
    p.targets.map((r) => ({
      id: randomUUID(),
      event_id: eventId,
      version_label: s(r, "target_version"),
      effective_at: s(r, "effective_at"),
      qualified_brands_goal: n(r, "qualified_brands_goal"),
      confirmed_partnerships_goal: n(r, "confirmed_partnerships_goal"),
    })),
  );

  await insertChunks(
    "stale_rules",
    STALE_DEFAULTS.map(([state_key, days_threshold]) => ({ event_id: eventId, state_key, days_threshold })),
  );

  return {
    eventId,
    counts: {
      team_members: team.size,
      campaigns: p.campaigns.length,
      brands: p.brands.length,
      contacts: contactRows.length,
      activities: activityRows.length,
      qualification_history: p.qualification.length,
      deals: dealRows.length,
      deal_history: p.history.length,
      sponsor_activations: p.activations.length,
      targets: p.targets.length,
    },
    removedDuplicates: p.removed,
    skipped,
  };
}
