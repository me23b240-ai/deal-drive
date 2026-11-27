import { getServiceClient } from "@/lib/db/client";
import { addBusinessDays } from "@/lib/domain/bizdays";
import type { StatusCode } from "@/lib/domain/status";
import { getHolidays } from "@/lib/db/queries/holidays";
import { resolveAssumptions, type ModelAssumptions } from "@/lib/model/assumptions";
import type { Ctx, StaleRule, TeamGoal } from "@/lib/types";

export function getAssumptions(ctx: Ctx): ModelAssumptions {
  return resolveAssumptions(ctx.event.model_assumptions);
}

export async function getStaleRules(ctx: Ctx): Promise<StaleRule[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("stale_rules")
    .select("state_key, days_threshold")
    .eq("event_id", ctx.eventId);
  if (error) throw new Error(`stale_rules: ${error.message}`);
  return (data ?? []).map((row) => ({
    state_key: String(row.state_key),
    days_threshold: Number(row.days_threshold),
  }));
}

/** Default next follow-up: today plus the status threshold in business days (null if no rule). */
export async function getDefaultFollowUp(ctx: Ctx, status: StatusCode): Promise<string | null> {
  const [rules, holidays] = await Promise.all([getStaleRules(ctx), getHolidays(ctx.eventId)]);
  const rule = rules.find((r) => r.state_key === status);
  return rule ? addBusinessDays(ctx.todayIst, rule.days_threshold, holidays) : null;
}

export async function getTeamGoals(ctx: Ctx): Promise<{ base: TeamGoal | null; stretch: TeamGoal | null }> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("targets")
    .select("scenario, signed_value_goal_inr, cash_collected_goal_inr, version_label, effective_at")
    .eq("event_id", ctx.eventId)
    .order("effective_at", { ascending: false });
  if (error) throw new Error(`targets: ${error.message}`);
  const pick = (scenario: "base" | "stretch"): TeamGoal | null => {
    const row = (data ?? []).find((r) => r.scenario === scenario);
    if (!row) return null;
    return {
      scenario,
      signed_value_goal_inr: row.signed_value_goal_inr === null ? null : Number(row.signed_value_goal_inr),
      cash_collected_goal_inr: row.cash_collected_goal_inr === null ? null : Number(row.cash_collected_goal_inr),
      version_label: (row.version_label as string | null) ?? null,
    };
  };
  return { base: pick("base"), stretch: pick("stretch") };
}