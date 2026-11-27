import { getServiceClient } from "../client";
import { requireHead } from "../guards";
import type { Ctx } from "../../types";
import { addDays, isBusinessDay } from "../../domain/bizdays";
import { getHolidays } from "./holidays";
import { coordinatorsOf, listTeam } from "./team";

type Row = Record<string, unknown>;
export type EodCell = "submitted" | "missing" | "pending";

export type EodData = {
  today: string;
  days: string[];
  members: { memberId: string; name: string; cells: EodCell[]; missingCount: number }[];
  reports: { id: string; name: string; date: string; note: string | null; lines: string[] }[];
};

function summaryLines(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Row).flatMap(([k, v]) => {
    const key = k.replace(/_/g, " ");
    if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return [`${key}: ${String(v)}`];
    if (Array.isArray(v)) return [`${key}: ${v.length}`];
    return [];
  });
}

/** Last five business days (today included when it is one) against each coordinator. */
export async function getEodFeed(ctx: Ctx): Promise<EodData> {
  requireHead(ctx);
  const [team, holidays] = await Promise.all([listTeam(ctx.eventId), getHolidays(ctx.eventId)]);
  const members = coordinatorsOf(team);

  const days: string[] = [];
  for (let cursor = ctx.todayIst, guard = 0; days.length < 5 && guard < 30; cursor = addDays(cursor, -1), guard += 1) {
    if (isBusinessDay(cursor, holidays)) days.unshift(cursor);
  }

  let reports: Row[] = [];
  if (members.length > 0 && days.length > 0) {
    const { data, error } = await getServiceClient()
      .from("eod_reports")
      .select("id, member_id, report_date, auto_summary, note, submitted_at")
      .in("member_id", members.map((m) => m.id))
      .gte("report_date", days[0] as string)
      .order("report_date", { ascending: false });
    if (error) throw new Error(`eod_reports: ${error.message}`);
    reports = (data ?? []) as Row[];
  }

  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const done = new Set(reports.map((r) => `${String(r.member_id)}|${String(r.report_date)}`));
  const rows = members.map((m) => {
    const cells = days.map((d): EodCell => (done.has(`${m.id}|${d}`) ? "submitted" : d === ctx.todayIst ? "pending" : "missing"));
    return { memberId: m.id, name: m.name, cells, missingCount: cells.filter((c) => c === "missing").length };
  });

  return {
    today: ctx.todayIst,
    days,
    members: rows,
    reports: reports.map((r) => ({
      id: String(r.id),
      name: nameOf.get(String(r.member_id)) ?? "Unknown",
      date: String(r.report_date),
      note: r.note ? String(r.note) : null,
      lines: summaryLines(r.auto_summary),
    })),
  };
}