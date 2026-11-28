import { getServiceClient } from "@/lib/db/client";
import { assertWritable, requireMember } from "@/lib/db/guards";
import { ValidationError } from "@/lib/db/errors";
import { addDays } from "@/lib/domain/bizdays";
import type { Ctx } from "@/lib/types";
import { getNeedsUpdate } from "./views";

export type EodSummary = {
  mailsSent: number;
  calls: number;
  callsNoAnswer: number;
  statusChanges: number;
  notes: number;
  tasksDone: number;
  needsUpdate: number;
  needsUpdateTop: string[];
};

export type EodState = {
  date: string;
  summary: EodSummary;
  submitted: { note: string; submittedAt: string } | null;
};

const istStart = (day: string): string => new Date(`${day}T00:00:00+05:30`).toISOString();

/** Everything is counted for the coordinator's IST day, straight from the database. The browser never supplies numbers. */
async function computeSummary(ctx: Ctx, me: string): Promise<EodSummary> {
  const supabase = getServiceClient();
  const from = istStart(ctx.todayIst);
  const to = istStart(addDays(ctx.todayIst, 1));
  const [acts, tasks, needs] = await Promise.all([
    supabase.from("activities").select("event_type, outcome").eq("event_id", ctx.eventId).eq("owner_id", me).gte("occurred_at", from).lt("occurred_at", to),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("event_id", ctx.eventId)
      .eq("owner_id", me)
      .eq("status", "done")
      .gte("completed_at", from)
      .lt("completed_at", to),
    getNeedsUpdate(ctx),
  ]);
  if (acts.error) throw new Error(`activities: ${acts.error.message}`);
  if (tasks.error) throw new Error(`tasks: ${tasks.error.message}`);
  const rows = acts.data ?? [];
  const count = (type: string, outcome?: string): number =>
    rows.filter((r) => r.event_type === type && (outcome === undefined || r.outcome === outcome)).length;
  return {
    mailsSent: count("mail_sent"),
    calls: count("call_attempt"),
    callsNoAnswer: count("call_attempt", "no_answer"),
    statusChanges: count("status_change"),
    notes: count("note"),
    tasksDone: tasks.count ?? 0,
    needsUpdate: needs.length,
    needsUpdateTop: needs.slice(0, 5).map((n) => n.company),
  };
}

export async function getEodState(ctx: Ctx): Promise<EodState> {
  const me = requireMember(ctx);
  const supabase = getServiceClient();
  const [summary, existing] = await Promise.all([
    computeSummary(ctx, me),
    supabase.from("eod_reports").select("note, submitted_at").eq("member_id", me).eq("report_date", ctx.todayIst).limit(1),
  ]);
  if (existing.error) throw new Error(`eod_reports: ${existing.error.message}`);
  const row = existing.data?.[0];
  return {
    date: ctx.todayIst,
    summary,
    submitted: row ? { note: String(row.note ?? ""), submittedAt: String(row.submitted_at) } : null,
  };
}

/** One report per coordinator per day. Submitting again updates it. */
export async function submitEod(ctx: Ctx, note: string | null): Promise<{ updated: boolean }> {
  assertWritable(ctx);
  const me = requireMember(ctx);
  const text = (note ?? "").trim();
  if (text.length > 2000) throw new ValidationError("Keep the note under 2000 characters.");
  const supabase = getServiceClient();
  const summary = await computeSummary(ctx, me);
  const now = new Date().toISOString();
  const { data: found, error: fErr } = await supabase.from("eod_reports").select("id").eq("member_id", me).eq("report_date", ctx.todayIst).limit(1);
  if (fErr) throw new Error(`eod_reports: ${fErr.message}`);
  const existing = found?.[0];
  if (existing) {
    const { error } = await supabase.from("eod_reports").update({ auto_summary: summary, note: text, submitted_at: now }).eq("id", existing.id);
    if (error) throw new Error(`eod_reports: ${error.message}`);
    return { updated: true };
  }
  const { error } = await supabase.from("eod_reports").insert({ member_id: me, report_date: ctx.todayIst, auto_summary: summary, note: text, submitted_at: now });
  if (error) throw new Error(`eod_reports: ${error.message}`);
  return { updated: false };
}