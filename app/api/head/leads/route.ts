import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { ValidationError } from "@/lib/db/errors";
import { assertWritable, requireHead } from "@/lib/db/guards";
import { getCtx } from "@/lib/db/queries/ctx";
import { assignLead, importLeads, setCandidateStatus } from "@/lib/db/queries/head-a-leads";

export const dynamic = "force-dynamic";

const opt = z.string().max(200).optional();
const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("import"),
    batch: z.string().max(120),
    rows: z
      .array(z.object({ brandName: z.string().trim().min(1).max(200), sector: opt, contactName: opt, contactEmail: opt, contactTitle: opt, channel: z.string().max(40), signal: z.string().max(40).nullable().optional() }))
      .min(1)
      .max(500),
  }),
  z.object({ action: z.literal("assign"), candidateId: z.string().min(1), ownerId: z.string().min(1) }),
  z.object({ action: z.literal("status"), candidateId: z.string().min(1), status: z.enum(["new", "not_fit"]) }),
]);

export async function POST(request: Request) {
  try {
    const ctx = await getCtx("head");
    requireHead(ctx);
    assertWritable(ctx);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ValidationError("Invalid input: check the file has at most 500 rows with a company name.");
    const b = parsed.data;
    let data: unknown;
    if (b.action === "import") data = await importLeads(ctx, b.rows, b.batch);
    else if (b.action === "assign") data = { brandId: await assignLead(ctx, b.candidateId, b.ownerId) };
    else {
      await setCandidateStatus(ctx, b.candidateId, b.status);
      data = {};
    }
    revalidatePath("/head");
    revalidatePath("/head/leads");
    revalidatePath("/coordinator");
    return apiOk(data);
  } catch (error) {
    return apiFail(error);
  }
}