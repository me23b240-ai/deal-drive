import type { z } from "zod";
import { ValidationError } from "@/lib/db/errors";

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const raw: unknown = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input");
  return parsed.data;
}