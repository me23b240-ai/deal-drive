import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { ValidationError } from "@/lib/db/errors";
import { assertWritable, requireHead } from "@/lib/db/guards";
import { getCtx } from "@/lib/db/queries/ctx";
import { editOpportunity, editQualification } from "@/lib/db/queries/head-b-datalab";

export const dynamic = "force-dynamic";

const money = z.number().int().min(0).max(1_000_000_000);
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("deal"), id: z.string().min(1), stage: z.string().min(1).max(40).optional(), proposedInr: money.optional(), signedInr: money.optional() }),
  z.object({ action: z.literal("qual"), brandId: z.string().min(1), status: z.string().min(1).max(60) }),
]);

export async function PATCH(request: Request) {
  try {
    const ctx = await getCtx("head");
    requireHead(ctx);
    assertWritable(ctx);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ValidationError("Invalid input.");
    const b = parsed.data;
    if (b.action === "deal") await editOpportunity(ctx, b.id, { stage: b.stage, proposedInr: b.proposedInr, signedInr: b.signedInr });
    else await editQualification(ctx, b.brandId, b.status);
    revalidatePath("/head");
    return apiOk({ action: b.action });
  } catch (error) {
    return apiFail(error);
  }
}