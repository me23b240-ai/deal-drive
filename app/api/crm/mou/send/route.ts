import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/parse";
import { getCtx } from "@/lib/db/queries/ctx";
import { markMouSent } from "@/lib/db/queries/crm-mou";

export async function POST(req: Request) {
  try {
    const ctx = await getCtx("coordinator");
    return apiOk(await markMouSent(ctx, (await parseBody(req, z.object({ brandId: z.string().min(1) }))).brandId));
  } catch (error) {
    return apiFail(error);
  }
}