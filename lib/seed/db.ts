import { getServiceClient } from "../db/client";

export async function insertChunks(table: string, rows: Record<string, unknown>[], size = 200): Promise<void> {
  const sb = getServiceClient();
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await sb.from(table).insert(rows.slice(i, i + size));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function idsOf(table: string, column: string, value: string): Promise<string[]> {
  const sb = getServiceClient();
  const out: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select("id").eq(column, value).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []).map((r) => String(r.id)));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function deleteIn(table: string, column: string, ids: string[]): Promise<void> {
  const sb = getServiceClient();
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await sb.from(table).delete().in(column, ids.slice(i, i + 100));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function deleteByEvent(table: string, eventId: string): Promise<void> {
  const { error } = await getServiceClient().from(table).delete().eq("event_id", eventId);
  if (error) throw new Error(`${table}: ${error.message}`);
}

/** Removes every row of one event (children first). The events row itself is kept. */
export async function wipeEvent(eventId: string): Promise<void> {
  const sessions = await idsOf("chat_sessions", "event_id", eventId);
  await deleteIn("chat_messages", "session_id", sessions);
  await deleteIn("pending_actions", "session_id", sessions);
  await deleteByEvent("chat_sessions", eventId);

  const members = await idsOf("team_members", "event_id", eventId);
  await deleteIn("eod_reports", "member_id", members);

  const deals = await idsOf("deals", "event_id", eventId);
  await deleteIn("payments", "deal_id", deals);
  await deleteIn("deal_history", "deal_id", deals);

  const brands = await idsOf("brands", "event_id", eventId);

  for (const table of [
    "tasks",
    "activities",
    "email_drafts",
    "sponsor_activations",
    "status_events",
    "import_batches",
    "weekly_targets",
    "deliverable_catalog",
  ]) {
    await deleteByEvent(table, eventId);
  }
  await deleteByEvent("deals", eventId);
  await deleteIn("qualification_history", "brand_id", brands);
  await deleteIn("contacts", "brand_id", brands);
  await deleteByEvent("brands", eventId);

  for (const table of [
    "campaigns",
    "team_members",
    "targets",
    "stale_rules",
    "holidays",
    "packages",
    "fact_bank",
    "portfolio_gates",
  ]) {
    await deleteByEvent(table, eventId);
  }
}