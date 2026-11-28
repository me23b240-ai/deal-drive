import { requireHead } from "../guards";
import type { Ctx } from "../../types";
import { LEAD_CHANNEL_LABELS, type LeadChannel } from "../../domain/channels";
import { SIGNAL_LABELS, isSignalTag } from "../../domain/signals";
import { scoreOf, type Score, type ScoreInput } from "../../model/peerfest";
import { fetchAll } from "./page";

type Row = Record<string, unknown>;
export type ScoreLine = { key: string; label: string; score: Score };
export type SourceScorecard = { byChannel: ScoreLine[]; bySignal: ScoreLine[] };

const text = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));

function group(rows: ScoreInput[], label: (k: string) => string): ScoreLine[] {
  const keys = [...new Set(rows.map((r) => r.festId))];
  return keys
    .map((k) => ({ key: k, label: label(k), score: scoreOf(rows.filter((r) => r.festId === k)) }))
    .sort((a, b) => b.score.n - a.score.n || a.label.localeCompare(b.label));
}

export async function getSourceScorecard(ctx: Ctx): Promise<SourceScorecard> {
  requireHead(ctx);
  const [brands, events] = await Promise.all([
    fetchAll<Row>("brands", "id, source_channel, signal_tag, first_outreach_at, first_response_at, crm_status", { event_id: ctx.eventId }),
    fetchAll<Row>("status_events", "brand_id, to_status", { event_id: ctx.eventId }),
  ]);
  const reached = new Set(events.filter((e) => e.to_status === "prospective" || e.to_status === "converted").map((e) => String(e.brand_id)));
  const mk = (b: Row, key: string): ScoreInput => ({
    festId: key,
    outreached: text(b.first_outreach_at) !== null,
    responded: text(b.first_response_at) !== null,
    proposal: reached.has(String(b.id)),
    signed: b.crm_status === "converted",
  });
  const live = brands.filter((b) => b.crm_status !== null);
  const byChannel = live.map((b) => mk(b, text(b.source_channel) ?? "unknown"));
  const bySignal = live.filter((b) => text(b.signal_tag) !== null).map((b) => mk(b, String(b.signal_tag)));
  return {
    byChannel: group(byChannel, (k) => LEAD_CHANNEL_LABELS[k as LeadChannel] ?? k),
    bySignal: group(bySignal, (k) => (isSignalTag(k) ? SIGNAL_LABELS[k] : k)),
  };
}