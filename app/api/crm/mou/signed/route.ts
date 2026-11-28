import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/parse";
import { getCtx } from "@/lib/db/queries/ctx";
import { markMouSigned } from "@/lib/db/queries/crm-mou";

const schema = z.object({ brandId: z.string().min(1), signedOn: z.string() });

export async function POST(req: Request) {
  try {
    const ctx = await getCtx("coordinator");
    const { brandId, signedOn } = await parseBody(req, schema);
    return apiOk(await markMouSigned(ctx, brandId, signedOn));
  } catch (error) {
    return apiFail(error);
  }
}