import { getServiceClient } from "@/lib/db/client";
import { assertWritable, requireMember } from "@/lib/db/guards";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/db/errors";
import { sequenceTasks } from "@/lib/domain/sequence";
import type { Ctx } from "@/lib/types";
import { getHolidays } from "./holidays";

export type SequenceResult = { tasksCreated: number; taskWarning: string | null };

const REPLIED = ["contacted", "prospective", "converted", "rejected"];

export function checkOffsets(step1: number, step2: number): void {
  if (!Number.isInteger(step1) || !Number.isInteger(step2) || step1 < 1 || step2 > 30) throw new ValidationError("Follow-up days must be whole numbers between 1 and 30.");
  if (step2 <= step1) throw new ValidationError("Follow-up 2 must come after follow-up 1.");
}

/** After a first mail is marked sent: one task per follow-up step, due on the day. Nothing is created if the company already replied. */
export async function scheduleSequence(ctx: Ctx, draftId: string, offsets: { step1: number; step2: number }): Promise<SequenceResult> {
  assertWritable(ctx);
  const me = requireMember(ctx);
  checkOffsets(offsets.step1, offsets.step2);
  const supabase = getServiceClient();
  const { data: d, error } = await supabase.from("email_drafts").select("id, event_id, brand_id, owner_id, sequence_step").eq("id", draftId).maybeSingle();
  if (error) throw new Error(`email_drafts: ${error.message}`);
  if (!d || d.event_id !== ctx.eventId) throw new NotFoundError("Draft not found.");
  if (d.owner_id !== me) throw new ForbiddenError("This draft belongs to another coordinator.");
  if (d.sequence_step !== "initial") return { tasksCreated: 0, taskWarning: null };

  const { data: b, error: bErr } = await supabase.from("brands").select("name, crm_status").eq("id", d.brand_id).maybeSingle();
  if (bErr) throw new Error(`brands: ${bErr.message}`);
  if (!b) throw new NotFoundError("Company not found.");

  const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("brand_id", d.brand_id).eq("source", "sequence").eq("status", "todo");
  if ((count ?? 0) > 0) return { tasksCreated: 0, taskWarning: null };

  const holidays = await getHolidays(ctx.eventId);
  const plan = sequenceTasks(ctx.todayIst, holidays, { replied: REPLIED.includes(String(b.crm_status)), company: String(b.name), offsets });
  if (plan.length === 0) return { tasksCreated: 0, taskWarning: null };

  const { error: iErr } = await supabase.from("tasks").insert(
    plan.map((t) => ({ event_id: ctx.eventId, title: t.title, owner_id: me, created_by: me, brand_id: d.brand_id, due_date: t.dueOn, status: "todo", source: "sequence" })),
  );
  if (iErr) return { tasksCreated: 0, taskWarning: `The mail is marked sent, but the follow-up tasks couldn't be created (${iErr.message.slice(0, 80)}). Run the database migration.` };
  return { tasksCreated: plan.length, taskWarning: null };
}