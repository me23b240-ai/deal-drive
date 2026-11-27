import { revalidatePath } from "next/cache";
import { apiFail, apiOk } from "@/lib/api/respond";
import { ValidationError } from "@/lib/db/errors";
import { assertWritable, requireHead } from "@/lib/db/guards";
import { getCtx } from "@/lib/db/queries/ctx";
import { WORK_EVENT } from "@/lib/db/queries/head-b-datalab";
import { loadCampusFest } from "@/lib/seed/campusfest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const ctx = await getCtx("head");
    requireHead(ctx);
    assertWritable(ctx);
    if (ctx.eventId !== WORK_EVENT) throw new ValidationError("Upload is only allowed on the CampusFest working copy.");
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new ValidationError("Choose an .xlsx file to upload.");
    if (!file.name.toLowerCase().endsWith(".xlsx")) throw new ValidationError("Only .xlsx files are accepted.");
    if (file.size === 0 || file.size > MAX_BYTES) throw new ValidationError("The file must be between 1 byte and 10 MB.");
    const report = await loadCampusFest(Buffer.from(await file.arrayBuffer()), WORK_EVENT);
    revalidatePath("/head");
    return apiOk(report);
  } catch (error) {
    return apiFail(error);
  }
}