import { ValidationError } from "@/lib/db/errors";
import type { Ctx } from "@/lib/types";

export type QueueLead = {
  id: string;
  company: string;
  signal: string | null;
  source: string | null;
  angle: string | null;
  duplicate: { ownerName: string; mine: boolean } | null;
};

/** Placeholder while the queue is matched to the lead table that already exists in this project. */
export async function getMyQueue(_ctx: Ctx): Promise<{ leads: QueueLead[]; error: string | null }> {
  return { leads: [], error: "My queue is being matched to your existing lead table and will be switched on in the next step." };
}

export async function startOutreach(_ctx: Ctx, _leadId: string): Promise<{ brandId: string }> {
  throw new ValidationError("My queue isn't switched on yet.");
}