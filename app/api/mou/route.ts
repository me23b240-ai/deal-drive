import { z } from "zod";
import { apiFail } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/parse";
import { buildMouDocx } from "@/lib/mou/fill";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const text = (max: number) => z.string().trim().min(1).max(max);
const Body = z.object({
  companyName: text(120),
  shortName: z.string().trim().max(60).optional(),
  address: text(300),
  statePin: text(80),
  tagName: text(80),
  brandName: text(80),
  deliverables: z.array(text(300)).min(1).max(40),
  amountInr: z.number().int().positive().max(1_000_000_000),
  paymentTerms: z.enum(["100_0", "75_25", "50_50"]),
  signingAuthority: text(80),
  designation: text(80),
});

/** POST the MoU fields, get the filled IITM template back as a .docx. */
export async function POST(req: Request) {
  try {
    const fields = await parseBody(req, Body);
    const { buffer, needsReview, fileName } = buildMouDocx(fields);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "X-Mou-Needs-Review": needsReview ? "1" : "0",
      },
    });
  } catch (error) {
    return apiFail(error);
  }
}