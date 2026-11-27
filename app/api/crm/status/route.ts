import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/parse";
import { getCtx } from "@/lib/db/queries/ctx";
import { changeCompanyStatus } from "@/lib/db/queries/crm-status";
import { STATUS_CODES } from "@/lib/domain/status";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");
const schema = z.object({
  brandId: z.string().min(1),
  to: z.enum(STATUS_CODES),
  note: z.string().max(2000).nullish(),
  approxAmountInr: z.number().nonnegative().nullish(),
  nextFollowUp: day.nullish(),
  finalAmountInr: z.number().nonnegative().nullish(),
  inKindInr: z.number().nonnegative().nullish(),
  rejectionReason: z.string().max(500).nullish(),
});

export async function POST(req: Request) {
  try {
    const ctx = await getCtx("coordinator");
    return apiOk(await changeCompanyStatus(ctx, await parseBody(req, schema)));
  } catch (error) {
    return apiFail(error);
  }
}