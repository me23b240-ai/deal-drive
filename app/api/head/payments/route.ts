import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { ValidationError } from "@/lib/db/errors";
import { assertWritable, requireHead } from "@/lib/db/guards";
import { getCtx } from "@/lib/db/queries/ctx";
import { setPaymentReceived } from "@/lib/db/queries/head-b-payments";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ id: z.string().min(1), received: z.boolean() });

export async function PATCH(request: Request) {
  try {
    const ctx = await getCtx("head");
    requireHead(ctx);
    assertWritable(ctx);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ValidationError("Invalid input");
    await setPaymentReceived(ctx, parsed.data.id, parsed.data.received);
    revalidatePath("/head");
    revalidatePath("/coordinator");
    return apiOk({ id: parsed.data.id });
  } catch (error) {
    return apiFail(error);
  }
}