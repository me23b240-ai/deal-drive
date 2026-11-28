import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { ValidationError } from "@/lib/db/errors";
import { assertWritable, requireHead } from "@/lib/db/guards";
import { getCtx } from "@/lib/db/queries/ctx";
import {
  TARGET_LABELS,
  changeHoliday,
  saveDates,
  saveGoal,
  saveInitiativeRules,
  savePlan,
  saveStaleRules,
  saveWeeklyTargets,
} from "@/lib/db/queries/head-b-settings";

export const dynamic = "force-dynamic";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rate = z.number().min(0).max(1);
const seg = z.object({ response: rate, proposalRate: rate, signRate: rate });
const scenario = z.object({ closeRate: rate, inkindShare: rate, warm: seg, other: seg });
const leads = z.number().int().min(0).max(1000);

const bodySchema = z.discriminatedUnion("section", [
  z.object({
    section: z.literal("targets"),
    weekStart: date,
    items: z.array(z.object({ memberId: z.string().min(1), target: z.number().int().min(0).max(500), label: z.enum(TARGET_LABELS) })).min(1).max(50),
  }),
  z.object({
    section: z.literal("goals"),
    scenario: z.enum(["base", "stretch"]),
    signed: z.number().int().min(0).nullable(),
    cash: z.number().int().min(0).nullable(),
  }),
  z.object({
    section: z.literal("plan"),
    plan: z.object({
      avgNewDeal: z.number().min(0).max(100_000_000),
      prefestShare: rate,
      inkindScope: z.enum(["all", "new_only"]),
      stretchWarmLeads: leads,
      stretchOtherLeads: leads,
      warmSplit: z.object({ network: leads, referral: leads }), baselineAvgDeal: z.number().min(0).max(100_000_000),
      base: scenario,
      stretch: scenario,
    }),
  }),
  z.object({
    section: z.literal("dates"),
    bundleStart: date,
    bundleStop: date,
    prefestDue: date,
    postfestDue: date,
    useObserved: z.boolean(),
  }),
  z.object({
    section: z.literal("stale"),
    items: z.array(z.object({ stateKey: z.string().min(1).max(60), days: z.number().int().min(0).max(60) })).min(1).max(40),
  }),
  z.object({ section: z.literal("holiday"), op: z.enum(["add", "remove"]), day: date, name: z.string().max(80).optional() }),
  z.object({ section: z.literal("rules"), campaignId: z.string().min(1), scale: z.unknown(), change: z.unknown(), stop: z.unknown() }),
]);

export async function PATCH(request: Request) {
  try {
    const ctx = await getCtx("head");
    requireHead(ctx);
    assertWritable(ctx);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ValidationError("Invalid input: check that every value is in range.");
    const b = parsed.data;
    switch (b.section) {
      case "targets": await saveWeeklyTargets(ctx, b.weekStart, b.items); break;
      case "goals": await saveGoal(ctx, b.scenario, b.signed, b.cash); break;
      case "plan": await savePlan(ctx, b.plan); break;
      case "dates": await saveDates(ctx, b); break;
      case "stale": await saveStaleRules(ctx, b.items); break;
      case "holiday": await changeHoliday(ctx, b.op, b.day, b.name ?? ""); break;
      case "rules": await saveInitiativeRules(ctx, b.campaignId, { scale: b.scale ?? null, change: b.change ?? null, stop: b.stop ?? null }); break;
    }
    revalidatePath("/head");
    revalidatePath("/coordinator");
    return apiOk({ section: b.section });
  } catch (error) {
    return apiFail(error);
  }
}