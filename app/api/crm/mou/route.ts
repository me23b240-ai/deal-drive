import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/parse";
import { getCtx } from "@/lib/db/queries/ctx";
import { saveMou } from "@/lib/db/queries/crm-mou";
import { PAYMENT_TERMS } from "@/lib/domain/payments";

const schema = z.object({
  brandId: z.string().min(1),
  brandName: z.string().max(200),
  officialAddress: z.string().max(500),
  signatoryName: z.string().max(200),
  signatoryDesignation: z.string().max(200),
  tagline: z.string().max(200),
  deliverables: z.array(z.object({ name: z.string().max(200), qty: z.number().int().min(1).max(50) })).max(60),
  amountInr: z.number().int().nonnegative(),
  terms: z.enum(PAYMENT_TERMS as [string, ...string[]]),
  gstin: z.string().max(20),
  mouDate: z.string(),
  proformaDueDate: z.string(),
  deliveryWindow: z.string().max(300).nullish(),
});

export async function POST(req: Request) {
  try {
    const ctx = await getCtx("coordinator");
    const { brandId, deliveryWindow, terms, ...rest } = await parseBody(req, schema);
    await saveMou(ctx, brandId, { ...rest, terms: terms as (typeof PAYMENT_TERMS)[number], deliveryWindow: deliveryWindow ?? "" });
    return apiOk({ saved: true });
  } catch (error) {
    return apiFail(error);
  }
}