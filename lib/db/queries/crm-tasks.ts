import { getServiceClient } from "@/lib/db/client";
import { assertWritable, requireMember, scopeOwner } from "@/lib/db/guards";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/db/errors";
import { addBusinessDays } from "@/lib/domain/bizdays";
import type { Ctx } from "@/lib/types";
import { getHolidays } from "./holidays";
import { fetchAll } from "./page";

export type TaskRow = {
  id: string;
  title: string;
  dueOn: string | null;
  status: string;
  source: string;
  brandId: string | null;
  company: string | null;
};

export async function listTasks(ctx: Ctx, ownerId?: string | null): Promise<TaskRow[]> {
  const owner = scopeOwner(ctx, ownerId);
  const eq: Record<string, string> = { event_id: ctx.eventId };
  if (owner) eq.owner_id = owner;
  const rows = (await fetchAll<Record<string, unknown>>("tasks", "id, title, due_date, status, source, brand_id", eq)).filter(
    (r) => r.status === "todo" || r.status === "doing",
  );
  const ids = [...new Set(rows.map((r) => r.brand_id).filter((x): x is string => typeof x === "string"))];
  const names = new Map<string, string>();
  const supabase = getServiceClient();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from("brands").select("id, name").in("id", ids.slice(i, i + 100));
    if (error) throw new Error(`brands: ${error.message}`);
    for (const b of data ?? []) names.set(String(b.id), String(b.name));
  }
  return rows
    .map((r) => ({
      id: String(r.id),
      title: String(r.title),
      dueOn: (r.due_date as string | null) ?? null,
      status: String(r.status),
      source: String(r.source ?? "manual"),
      brandId: (r.brand_id as string | null) ?? null,
      company: typeof r.brand_id === "string" ? names.get(r.brand_id) ?? null : null,
    }))
    .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") || a.title.localeCompare(b.title));
}

export async function createTask(ctx: Ctx, input: { title: string; dueOn?: string | null; brandId?: string | null }): Promise<TaskRow> {
  assertWritable(ctx);
  const memberId = requireMember(ctx);
  const title = input.title.trim();
  if (!title) throw new ValidationError("A task needs a title.");
  const holidays = await getHolidays(ctx.eventId);
  const dueOn = input.dueOn ?? addBusinessDays(ctx.todayIst, 1, holidays);
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      event_id: ctx.eventId,
      title,
      owner_id: memberId,
      created_by: memberId,
      brand_id: input.brandId ?? null,
      due_date: dueOn,
      status: "todo",
      source: "manual",
    })
    .select("id, title, due_date, status, source, brand_id")
    .single();
  if (error) throw new Error(`tasks: ${error.message}`);
  return {
    id: String(data.id),
    title: String(data.title),
    dueOn: (data.due_date as string | null) ?? null,
    status: String(data.status),
    source: String(data.source),
    brandId: (data.brand_id as string | null) ?? null,
    company: null,
  };
}

export async function setTaskDone(ctx: Ctx, taskId: string, done: boolean): Promise<void> {
  assertWritable(ctx);
  const supabase = getServiceClient();
  const { data, error } = await supabase.from("tasks").select("id, owner_id, event_id").eq("id", taskId).maybeSingle();
  if (error) throw new Error(`tasks: ${error.message}`);
  if (!data || data.event_id !== ctx.eventId) throw new NotFoundError("Task not found.");
  if (ctx.role === "coordinator" && data.owner_id !== ctx.memberId) throw new ForbiddenError("This task belongs to someone else.");
  const { error: upErr } = await supabase
    .from("tasks")
    .update({ status: done ? "done" : "todo", completed_at: done ? new Date().toISOString() : null })
    .eq("id", taskId);
  if (upErr) throw new Error(`tasks: ${upErr.message}`);
}