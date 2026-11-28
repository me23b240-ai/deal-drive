import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { ValidationError } from "@/lib/db/errors";
import { assertWritable, requireHead } from "@/lib/db/guards";
import { getCtx } from "@/lib/db/queries/ctx";
import { createFest, makeLead, updateFest } from "@/lib/db/queries/head-a-peerfests";

export const dynamic = "force-dynamic";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const fest = z.object({
  name: z.string().trim().min(1).max(120),
  institution: z.string().trim().min(1).max(160),
  city: z.string().trim().min(1).max(80),
  tier: z.enum(["iit", "iim", "other"]),
  startsOn: date,
  endsOn: date,
  sponsorPageUrl: z.string().trim().url().max(300).nullable(),
  researchStatus: z.enum(["todo", "researching", "done"]),
  researcherId: z.string().min(1).nullable(),
  notes: z.string().max(500).nullable(),
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), fest }),
  z.object({ action: z.literal("update"), id: z.string().min(1), fest: fest.partial() }),
  z.object({ action: z.literal("lead"), sponsorId: z.string().min(1) }),
]);

export async function POST(request: Request) {
  try {
    const ctx = await getCtx("head");
    requireHead(ctx);
    assertWritable(ctx);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ValidationError("Invalid input: check the dates and the website address.");
    const b = parsed.data;
    let data: unknown;
    if (b.action === "create") data = { id: await createFest(ctx, b.fest) };
    else if (b.action === "update") {
      await updateFest(ctx, b.id, b.fest);
      data = {};
    } else data = await makeLead(ctx, b.sponsorId);
    revalidatePath("/head");
    revalidatePath("/head/peer-fests");
    revalidatePath("/head/leads");
    return apiOk(data);
  } catch (error) {
    return apiFail(error);
  }
}