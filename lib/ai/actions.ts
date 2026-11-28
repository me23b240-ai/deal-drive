import { getServiceClient } from "@/lib/db/client";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/db/errors";
import { assertWritable } from "@/lib/db/guards";
import { addBusinessDays } from "@/lib/domain/bizdays";
import { listCompanies } from "@/lib/db/queries/crm-companies";
import { nudgeDeal } from "@/lib/db/queries/crm-deals";
import { setFollowUp } from "@/lib/db/queries/crm-status";
import { createTask } from "@/lib/db/queries/crm-tasks";
import { getHolidays } from "@/lib/db/queries/holidays";
import { coordinatorsOf, listTeam } from "@/lib/db/queries/team";
import { getDealDesk } from "@/lib/db/queries/views";
import type { Ctx } from "@/lib/types";

export type ActionKind = "create_task" | "set_follow_up" | "nudge_deal";
export type ProposedAction = { id: string; kind: ActionKind; summary: string };
type Args = Record<string, unknown>;

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const isDate = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v);

async function insertAction(ctx: Ctx, kind: ActionKind, payload: Record<string, unknown>, summary: string): Promise<ProposedAction> {
  const { data, error } = await getServiceClient()
    .from("ai_actions")
    .insert({ event_id: ctx.eventId, kind, payload, summary, proposed_by: ctx.memberId, proposed_by_role: ctx.role })
    .select("id")
    .single();
  if (error) throw new Error(`ai_actions: ${error.message}`);
  return { id: String(data.id), kind, summary };
}

async function brandByName(ctx: Ctx, name: string): Promise<{ id: string; name: string }> {
  if (!name) throw new ValidationError("Say which company.");
  const hits = await listCompanies(ctx, { q: name, pageSize: 5 });
  const first = hits.rows[0];
  if (!first) throw new NotFoundError(`No company matching "${name}".`);
  if (hits.rows.length > 1) {
    const exact = hits.rows.find((r) => r.name.toLowerCase() === name.toLowerCase());
    if (!exact) throw new ValidationError(`"${name}" matches several companies: ${hits.rows.map((r) => r.name).join(", ")}. Which one?`);
    return { id: exact.id, name: exact.name };
  }
  return { id: first.id, name: first.name };
}

export async function proposeTask(ctx: Ctx, a: Args): Promise<ProposedAction> {
  const title = s(a.title);
  if (!title || title.length > 140) throw new ValidationError("A task needs a title of at most 140 characters.");
  const due = s(a.due_on);
  if (due && (!isDate(due) || due < ctx.todayIst)) throw new ValidationError("due_on must be YYYY-MM-DD and not in the past.");
  let ownerId = ctx.memberId;
  let ownerName = "you";
  if (ctx.role === "head") {
    const who = s(a.owner_name).toLowerCase();
    const owner = coordinatorsOf(await listTeam(ctx.eventId)).find((m) => m.name.toLowerCase().includes(who));
    if (!who || !owner) throw new ValidationError("Say which coordinator owns this task.");
    ownerId = owner.id;
    ownerName = owner.name;
  }
  const brand = s(a.company_name) ? await brandByName(ctx, s(a.company_name)) : null;
  const summary = `Create task "${title}" for ${ownerName}${brand ? ` on ${brand.name}` : ""}${due ? `, due ${due}` : ""}`;
  return insertAction(ctx, "create_task", { title, ownerId, brandId: brand?.id ?? null, dueOn: due || null }, summary);
}

export async function proposeFollowUp(ctx: Ctx, a: Args): Promise<ProposedAction> {
  const date = s(a.date);
  if (!isDate(date) || date < ctx.todayIst) throw new ValidationError("date must be YYYY-MM-DD and not in the past.");
  const brand = await brandByName(ctx, s(a.company_name));
  return insertAction(ctx, "set_follow_up", { brandId: brand.id, date }, `Set next follow-up for ${brand.name} to ${date}`);
}

export async function proposeNudge(ctx: Ctx, a: Args): Promise<ProposedAction> {
  const name = s(a.company_name).toLowerCase();
  if (!name) throw new ValidationError("Say which company.");
  const deals = (await getDealDesk(ctx)).filter((d) => d.company.toLowerCase().includes(name));
  const deal = deals[0];
  if (!deal) throw new NotFoundError(`No open deal for "${s(a.company_name)}".`);
  if (deals.length > 1) throw new ValidationError(`Several open deals match: ${deals.map((d) => d.company).join(", ")}. Which one?`);
  return insertAction(ctx, "nudge_deal", { dealId: deal.deal_id }, `Log a nudge on ${deal.company} (${deal.stage}, idle ${deal.idle_bdays} business days)`);
}

async function execute(ctx: Ctx, kind: ActionKind, p: Record<string, unknown>): Promise<void> {
  switch (kind) {
    case "create_task": {
      const title = s(p.title);
      const brandId = s(p.brandId) || null;
      const dueOn = s(p.dueOn) || null;
      if (ctx.role === "coordinator") {
        await createTask(ctx, { title, dueOn, brandId });
        return;
      }
      const owner = s(p.ownerId);
      const team = await listTeam(ctx.eventId);
      const manager = team.find((m) => m.role === "manager");
      const due = dueOn ?? addBusinessDays(ctx.todayIst, 1, await getHolidays(ctx.eventId));
      const { error } = await getServiceClient().from("tasks").insert({
        event_id: ctx.eventId,
        title,
        owner_id: owner,
        created_by: manager?.id ?? owner,
        brand_id: brandId,
        due_date: due,
        status: "todo",
        source: "copilot",
      });
      if (error) throw new Error(`tasks: ${error.message}`);
      return;
    }
    case "set_follow_up":
      await setFollowUp(ctx, s(p.brandId), s(p.date));
      return;
    case "nudge_deal":
      await nudgeDeal(ctx, s(p.dealId));
      return;
  }
}

/** Claims the pending action first (so a double click cannot run it twice), then executes on confirm. */
export async function resolveAction(ctx: Ctx, id: string, decision: "confirm" | "reject"): Promise<{ status: string; summary: string }> {
  const supabase = getServiceClient();
  if (decision === "confirm") assertWritable(ctx);
  const { data: row, error } = await supabase
    .from("ai_actions")
    .select("id, kind, payload, summary, status, proposed_by, event_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`ai_actions: ${error.message}`);
  if (!row || row.event_id !== ctx.eventId) throw new NotFoundError("Action not found.");
  if (ctx.role === "coordinator" && row.proposed_by !== ctx.memberId) throw new ForbiddenError("This proposal belongs to someone else.");

  const next = decision === "confirm" ? "confirmed" : "rejected";
  const claimed = await supabase
    .from("ai_actions")
    .update({ status: next, resolved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (claimed.error) throw new Error(`ai_actions: ${claimed.error.message}`);
  if (!claimed.data) throw new ValidationError("This proposal was already resolved.");
  if (decision === "reject") return { status: "rejected", summary: String(row.summary) };

  try {
    await execute(ctx, row.kind as ActionKind, (row.payload ?? {}) as Record<string, unknown>);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await supabase.from("ai_actions").update({ status: "failed", error: message }).eq("id", id);
    throw e;
  }
  return { status: "confirmed", summary: String(row.summary) };
}