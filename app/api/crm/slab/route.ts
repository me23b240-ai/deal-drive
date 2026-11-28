import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/parse";
import { getCtx } from "@/lib/db/queries/ctx";
import { saveSlab } from "@/lib/db/queries/crm-slab";
import { PAYMENT_TERMS } from "@/lib/domain/payments";

const item = z.object({
  catalogId: z.string().min(1).nullish(),
  packageId: z.string().min(1).nullish(),
  creatorId: z.string().min(1).nullish(),
  name: z.string().max(120).nullish(),
  qty: z.number().int(),
  unitPriceInr: z.number().int(),
  inKind: z.boolean(),
});
const schema = z.object({
  brandId: z.string().min(1),
  items: z.array(item).max(40),
  discountInr: z.number().int().nonnegative(),
  terms: z.enum(PAYMENT_TERMS as [string, ...string[]]),
});

export async function POST(req: Request) {
  try {
    const ctx = await getCtx("coordinator");
    const body = await parseBody(req, schema);
    return apiOk(await saveSlab(ctx, { ...body, terms: body.terms as (typeof PAYMENT_TERMS)[number] }));
  } catch (error) {
    return apiFail(error);
  }
}