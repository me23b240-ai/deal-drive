import { getServiceClient } from "../client";
import { NotFoundError, ValidationError } from "../errors";
import { assertWritable, requireHead } from "../guards";
import type { Ctx, StaleRule, TeamGoal } from "../../types";
import { weekStartIST } from "../../domain/bizdays";
import { validateRuleJson } from "../../domain/rules-engine";
import { mergeSettings, type ModelSettings } from "../../model/projection";
import { getHolidays } from "./holidays";
import { fetchAll, num } from "./page";
import { getPlanSettings } from "./plan";
import { getAssumptions, getStaleRules, getTeamGoals } from "./settings";
import { coordinatorsOf, listTeam } from "./team";

type Row = Record<string, unknown>;
export type PlanPatch = Parameters<typeof mergeSettings>[0];

export const TARGET_LABELS = ["normal", "sprint", "off"] as const;

export type SettingsData = {
  weekStart: string;
  defaultTarget: number;
  targets: { memberId: string; name: string; target: number; label: string }[];
  goals: { base: TeamGoal | null; stretch: TeamGoal | null };
  plan: ModelSettings;
  dates: { bundleStart: string; bundleStop: string; prefestDue: string; postfestDue: string; useObserved: boolean };
  staleRules: StaleRule[];
  holidays: string[];
  rules: { campaignId: string; code: string; name: string; scale: unknown; change: unknown; stop: unknown }[];
};

export async function getSettingsData(ctx: Ctx): Promise<SettingsData> {
  requireHead(ctx);
  const weekStart = weekStartIST(ctx.todayIst);
  const [team, rows, goals, stale, holidays, campaigns] = await Promise.all([
    listTeam(ctx.eventId),
    fetchAll<Row>("weekly_targets", "member_id, target_outreach, label", { event_id: ctx.eventId, week_start: weekStart }),
    getTeamGoals(ctx),
    getStaleRules(ctx),
    getHolidays(ctx.eventId),
    fetchAll<Row>("campaigns", "id, source_id, name, scale_rule, change_rule, stop_rule", { event_id: ctx.eventId, kind: "initiative" }),
  ]);
  const a = getAssumptions(ctx);
  return {
    weekStart,
    defaultTarget: ctx.event.weekly_target_default,
    targets: coordinatorsOf(team).map((m) => {
      const r = rows.find((x) => String(x.member_id) === m.id);
      return { memberId: m.id, name: m.name, target: r ? num(r.target_outreach) : ctx.event.weekly_target_default, label: r ? String(r.label ?? "normal") : "normal" };
    }),
    goals,
    plan: getPlanSettings(ctx),
    dates: { bundleStart: a.bundle_discount_start, bundleStop: a.bundle_discount_stop, prefestDue: a.prefest_due_date, postfestDue: a.postfest_due_date, useObserved: a.use_observed },
    staleRules: stale.sort((x, y) => x.state_key.localeCompare(y.state_key)),
    holidays: holidays.map((h) => h.day).sort(),
    rules: campaigns
      .map((c) => ({ campaignId: String(c.id), code: String(c.source_id), name: String(c.name), scale: c.scale_rule ?? null, change: c.change_rule ?? null, stop: c.stop_rule ?? null }))
      .sort((x, y) => x.code.localeCompare(y.code)),
  };
}

function guard(ctx: Ctx): void {
  requireHead(ctx);
  assertWritable(ctx);
}

async function writeAssumptions(ctx: Ctx, mutate: (current: Record<string, unknown>) => Record<string, unknown>): Promise<void> {
  const supabase = getServiceClient();
  const found = await supabase.from("events").select("model_assumptions").eq("id", ctx.eventId).maybeSingle();
  if (found.error) throw new Error(`events: ${found.error.message}`);
  const raw = found.data?.model_assumptions;
  const current = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const res = await supabase.from("events").update({ model_assumptions: mutate(current) }).eq("id", ctx.eventId);
  if (res.error) throw new Error(`events: ${res.error.message}`);
}

export async function savePlan(ctx: Ctx, patch: PlanPatch): Promise<void> {
  guard(ctx);
  const merged = mergeSettings(patch, getPlanSettings(ctx));
  await writeAssumptions(ctx, (cur) => ({ ...cur, plan: merged }));
}

export async function saveDates(
  ctx: Ctx,
  d: { bundleStart: string; bundleStop: string; prefestDue: string; postfestDue: string; useObserved: boolean },
): Promise<void> {
  guard(ctx);
  if (d.bundleStop < d.bundleStart) throw new ValidationError("The bundle discount stop date is before the start date.");
  await writeAssumptions(ctx, (cur) => ({
    ...cur,
    bundle_discount_start: d.bundleStart,
    bundle_discount_stop: d.bundleStop,
    prefest_due_date: d.prefestDue,
    postfest_due_date: d.postfestDue,
    use_observed: d.useObserved,
  }));
}

export async function saveWeeklyTargets(
  ctx: Ctx,
  weekStart: string,
  items: { memberId: string; target: number; label: string }[],
): Promise<void> {
  guard(ctx);
  const team = new Set(coordinatorsOf(await listTeam(ctx.eventId)).map((m) => m.id));
  const supabase = getServiceClient();
  for (const it of items) {
    if (!team.has(it.memberId)) throw new NotFoundError("Unknown coordinator.");
    const upd = await supabase
      .from("weekly_targets")
      .update({ target_outreach: it.target, label: it.label })
      .eq("event_id", ctx.eventId)
      .eq("member_id", it.memberId)
      .eq("week_start", weekStart)
      .select("id");
    if (upd.error) throw new Error(`weekly_targets: ${upd.error.message}`);
    if ((upd.data ?? []).length === 0) {
      const ins = await supabase
        .from("weekly_targets")
        .insert({ event_id: ctx.eventId, member_id: it.memberId, week_start: weekStart, target_outreach: it.target, label: it.label });
      if (ins.error) throw new Error(`weekly_targets: ${ins.error.message}`);
    }
  }
}

export async function saveGoal(ctx: Ctx, scenario: "base" | "stretch", signed: number | null, cash: number | null): Promise<void> {
  guard(ctx);
  const supabase = getServiceClient();
  const latest = await supabase
    .from("targets")
    .select("id")
    .eq("event_id", ctx.eventId)
    .eq("scenario", scenario)
    .order("effective_at", { ascending: false })
    .limit(1);
  if (latest.error) throw new Error(`targets: ${latest.error.message}`);
  const values = { signed_value_goal_inr: signed, cash_collected_goal_inr: cash };
  const id = latest.data?.[0]?.id;
  const res = id
    ? await supabase.from("targets").update(values).eq("id", id)
    : await supabase.from("targets").insert({ event_id: ctx.eventId, scenario, version_label: "Settings", effective_at: new Date().toISOString(), ...values });
  if (res.error) throw new Error(`targets: ${res.error.message}`);
}

export async function saveStaleRules(ctx: Ctx, items: { stateKey: string; days: number }[]): Promise<void> {
  guard(ctx);
  const supabase = getServiceClient();
  for (const it of items) {
    const upd = await supabase
      .from("stale_rules")
      .update({ days_threshold: it.days })
      .eq("event_id", ctx.eventId)
      .eq("state_key", it.stateKey)
      .select("state_key");
    if (upd.error) throw new Error(`stale_rules: ${upd.error.message}`);
    if ((upd.data ?? []).length === 0) {
      const ins = await supabase.from("stale_rules").insert({ event_id: ctx.eventId, state_key: it.stateKey, days_threshold: it.days });
      if (ins.error) throw new Error(`stale_rules: ${ins.error.message}`);
    }
  }
}

export async function changeHoliday(ctx: Ctx, op: "add" | "remove", day: string, name: string): Promise<void> {
  guard(ctx);
  const supabase = getServiceClient();
  if (op === "remove") {
    const res = await supabase.from("holidays").delete().eq("event_id", ctx.eventId).eq("day", day);
    if (res.error) throw new Error(`holidays: ${res.error.message}`);
    return;
  }
  if ((await getHolidays(ctx.eventId)).some((h) => h.day === day)) throw new ValidationError("That holiday already exists.");
  const res = await supabase.from("holidays").insert({ event_id: ctx.eventId, day, name: name.trim() || "Holiday" });
  if (res.error) throw new Error(`holidays: ${res.error.message}`);
}

export async function saveInitiativeRules(
  ctx: Ctx,
  campaignId: string,
  rules: { scale: unknown; change: unknown; stop: unknown },
): Promise<void> {
  guard(ctx);
  for (const key of ["scale", "change", "stop"] as const) {
    const errors = validateRuleJson(rules[key] ?? null);
    if (errors.length > 0) throw new ValidationError(`${key} rule: ${errors.join("; ")}`);
  }
  const res = await getServiceClient()
    .from("campaigns")
    .update({ scale_rule: rules.scale ?? null, change_rule: rules.change ?? null, stop_rule: rules.stop ?? null })
    .eq("id", campaignId)
    .eq("event_id", ctx.eventId)
    .eq("kind", "initiative")
    .select("id");
  if (res.error) throw new Error(`campaigns: ${res.error.message}`);
  if ((res.data ?? []).length === 0) throw new NotFoundError("Initiative not found.");
}