import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { ValidationError } from "@/lib/db/errors";
import { assertWritable, requireHead } from "@/lib/db/guards";
import { getCtx } from "@/lib/db/queries/ctx";
import { createDecisionTasks } from "@/lib/db/queries/head-b-tasks";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ id: z.string().min(1).max(200) });

export async function POST(request: Request) {
  try {
    const ctx = await getCtx("head");
    requireHead(ctx);
    assertWritable(ctx);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ValidationError("Invalid input");
    const result = await createDecisionTasks(ctx, parsed.data.id);
    revalidatePath("/head");
    revalidatePath("/coordinator");
    return apiOk(result);
  } catch (error) {
    return apiFail(error);
  }
}