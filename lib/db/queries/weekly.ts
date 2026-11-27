import { getServiceClient } from "@/lib/db/client";
import { requireHead, scopeOwner } from "@/lib/db/guards";
import { ValidationError } from "@/lib/db/errors";
import { businessDaysLeftInWeek, weekEndIST, weekStartIST } from "@/lib/domain/bizdays";
import { getHolidays } from "@/lib/db/queries/holidays";
import { coordinatorsOf, listTeam } from "@/lib/db/queries/team";
import { getWeeklyProgress } from "@/lib/db/queries/views";
import type { Ctx, TeamWeekSummary, WeeklyStrip } from "@/lib/types";

export async function getWeeklyTarget(
  ctx: Ctx,
  memberId: string,
  weekStart: string,
): Promise<{ target: number; label: string; source: "row" | "default" }> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("weekly_targets")
    .select("target_outreach, label")
    .eq("event_id", ctx.eventId)
    .eq("member_id", memberId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw new Error(`weekly_targets: ${error.message}`);
  if (data) return { target: Number(data.target_outreach), label: String(data.label ?? "normal"), source: "row" };
  return { target: ctx.event.weekly_target_default, label: "normal", source: "default" };
}

/** Everything the coordinator weekly strip needs, from one place. */
export async function getWeeklyStrip(ctx: Ctx, memberId?: string | null): Promise<WeeklyStrip> {
  const owner = scopeOwner(ctx, memberId ?? ctx.memberId);
  if (!owner) throw new ValidationError("A coordinator must be selected.");
  const weekStart = weekStartIST(ctx.todayIst);
  const [holidays, tgt, progress] = await Promise.all([
    getHolidays(ctx.eventId),
    getWeeklyTarget(ctx, owner, weekStart),
    getWeeklyProgress(ctx, owner),
  ]);
  const row = progress.find((r) => r.week_start === weekStart);
  const outreached = row?.outreached ?? 0;
  const responded = row?.responded ?? 0;
  const left = businessDaysLeftInWeek(ctx.todayIst, holidays);
  const remaining = Math.max(0, tgt.target - outreached);
  return {
    weekStart,
    weekEnd: weekEndIST(weekStart),
    target: tgt.target,
    label: tgt.label,
    source: tgt.source,
    outreached,
    responded,
    responseRate: outreached > 0 ? responded / outreached : null,
    businessDaysLeft: left,
    remaining,
    requiredPerDay: left > 0 ? remaining / left : null,
  };
}

/** Head dashboard chip: team outreached vs team target this week. */
export async function getTeamWeekSummary(ctx: Ctx): Promise<TeamWeekSummary> {
  requireHead(ctx);
  const weekStart = weekStartIST(ctx.todayIst);
  const supabase = getServiceClient();
  const [team, progress, targets] = await Promise.all([
    listTeam(ctx.eventId),
    getWeeklyProgress(ctx),
    supabase
      .from("weekly_targets")
      .select("member_id, target_outreach")
      .eq("event_id", ctx.eventId)
      .eq("week_start", weekStart),
  ]);
  if (targets.error) throw new Error(`weekly_targets: ${targets.error.message}`);
  const members = coordinatorsOf(team).map((m) => {
    const target = targets.data?.find((t) => t.member_id === m.id)?.target_outreach;
    const p = progress.find((r) => r.owner_id === m.id && r.week_start === weekStart);
    return {
      memberId: m.id,
      name: m.name,
      target: target === undefined ? ctx.event.weekly_target_default : Number(target),
      outreached: p?.outreached ?? 0,
      responded: p?.responded ?? 0,
    };
  });
  return {
    weekStart,
    outreached: members.reduce((sum, m) => sum + m.outreached, 0),
    responded: members.reduce((sum, m) => sum + m.responded, 0),
    target: members.reduce((sum, m) => sum + m.target, 0),
    members,
  };
}