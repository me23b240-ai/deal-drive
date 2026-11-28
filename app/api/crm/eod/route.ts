import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/parse";
import { getCtx } from "@/lib/db/queries/ctx";
import { submitEod } from "@/lib/db/queries/crm-eod";

const schema = z.object({ note: z.string().max(2000).nullish() });

export async function POST(req: Request) {
  try {
    const ctx = await getCtx("coordinator");
    return apiOk(await submitEod(ctx, (await parseBody(req, schema)).note ?? null));
  } catch (error) {
    return apiFail(error);
  }
}