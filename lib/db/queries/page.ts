import { getServiceClient } from "../client";

/** Reads every row of a table or view (1000 per page), filtered by equality. */
export async function fetchAll<T>(table: string, select: string, eq: Record<string, string> = {}): Promise<T[]> {
  const supabase = getServiceClient();
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let query = supabase.from(table).select(select).range(from, from + 999);
    for (const [column, value] of Object.entries(eq)) query = query.eq(column, value);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export const num = (value: unknown): number => Number(value ?? 0);