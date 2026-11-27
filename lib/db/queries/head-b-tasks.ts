import { getServiceClient } from "../client";
import { NotFoundError, ValidationError } from "../errors";
import { assertWritable, requireHead } from "../guards";
import type { Ctx } from "../../types";
import { addBusinessDays } from "../../domain/bizdays";
import { getDecisions } from "./decisions";
import { getHolidays } from "./holidays";
import { fetchAll } from "./page";

type Row = Record<string, unknown>;

/** Creates the tasks of one decision (source head_decision), skipping tasks that are already open. */
export async function createDecisionTasks(ctx: Ctx, decisionId: string): Promise<{ created: number; skipped: number }> {
  requireHead(ctx);
  assertWritable(ctx);
  const decision = (await getDecisions(ctx)).find((d) => d.id === decisionId);
  if (!decision) throw new NotFoundError("This decision no longer applies. Refresh the page.");
  if (decision.tasksToCreate.length === 0) throw new ValidationError("This decision has no tasks to create.");

  const [existing, holidays] = await Promise.all([
    fetchAll<Row>("tasks", "title, owner_id, status", { event_id: ctx.eventId }),
    getHolidays(ctx.eventId),
  ]);
  const seen = new Set(
    existing.filter((t) => t.status === "todo" || t.status === "doing").map((t) => `${String(t.owner_id)}|${String(t.title)}`),
  );
  const due = addBusinessDays(ctx.todayIst, 1, holidays);
  const rows: Row[] = [];
  for (const t of decision.tasksToCreate) {
    if (!t.ownerId) continue;
    const key = `${t.ownerId}|${t.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      event_id: ctx.eventId,
      title: t.title,
      description: decision.evidence,
      owner_id: t.ownerId,
      brand_id: t.brandId,
      due_date: due,
      status: "todo",
      source: "head_decision",
    });
  }
  if (rows.length > 0) {
    const { error } = await getServiceClient().from("tasks").insert(rows);
    if (error) throw new Error(`tasks: ${error.message}`);
  }
  return { created: rows.length, skipped: decision.tasksToCreate.length - rows.length };
}

/** Escalation: a task for the deal owner saying the head will call the prospect directly. */
export async function escalateDeal(ctx: Ctx, dealId: string): Promise<void> {
  requireHead(ctx);
  assertWritable(ctx);
  const supabase = getServiceClient();
  const deal = await supabase.from("deals").select("id, event_id, owner_id, brand_id, name").eq("id", dealId).maybeSingle();
  if (deal.error) throw new Error(`deals: ${deal.error.message}`);
  if (!deal.data || deal.data.event_id !== ctx.eventId) throw new NotFoundError("Deal not found.");
  const brand = await supabase.from("brands").select("name").eq("id", deal.data.brand_id).maybeSingle();
  const company = String(brand.data?.name ?? deal.data.name ?? "this company");
  const holidays = await getHolidays(ctx.eventId);
  const { error } = await supabase.from("tasks").insert({
    event_id: ctx.eventId,
    title: `Escalation: head to call ${company} directly`,
    description: "Raised from the deal desk. Brief the head before the call.",
    owner_id: deal.data.owner_id,
    brand_id: deal.data.brand_id,
    deal_id: deal.data.id,
    due_date: addBusinessDays(ctx.todayIst, 1, holidays),
    status: "todo",
    source: "head_decision",
  });
  if (error) throw new Error(`tasks: ${error.message}`);
}