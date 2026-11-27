import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { ValidationError } from "@/lib/db/errors";
import { assertWritable, requireHead } from "@/lib/db/guards";
import { getCtx } from "@/lib/db/queries/ctx";
import { updateInitiative } from "@/lib/db/queries/head-a-initiatives";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  id: z.string().min(1),
  budget: z.number().min(0).max(1_000_000_000).optional(),
  spend: z.number().min(0).max(1_000_000_000).optional(),
  status: z.string().trim().min(1).max(40).optional(),
});

export async function PATCH(request: Request) {
  try {
    const ctx = await getCtx("head");
    requireHead(ctx);
    assertWritable(ctx);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ValidationError("Invalid input");
    const { id, ...patch } = parsed.data;
    await updateInitiative(ctx, id, patch);
    revalidatePath("/head");
    return apiOk({ id });
  } catch (error) {
    return apiFail(error);
  }
}