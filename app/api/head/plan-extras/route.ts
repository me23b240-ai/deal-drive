import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { ValidationError } from "@/lib/db/errors";
import { assertWritable, requireHead } from "@/lib/db/guards";
import { getCtx } from "@/lib/db/queries/ctx";
import { saveExtras } from "@/lib/db/queries/head-a-planextras";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  discountPct: z.number().min(0).max(30),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sectors: z.array(z.string().max(60)).max(30),
});

export async function PATCH(request: Request) {
  try {
    const ctx = await getCtx("head");
    requireHead(ctx);
    assertWritable(ctx);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ValidationError("Invalid input: check the discount and the date.");
    await saveExtras(ctx, parsed.data);
    revalidatePath("/head");
    return apiOk({});
  } catch (error) {
    return apiFail(error);
  }
}