import { getServiceClient } from "@/lib/db/client";
import type { Holiday } from "@/lib/domain/bizdays";

export async function getHolidays(eventId: string): Promise<Holiday[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from("holidays").select("day").eq("event_id", eventId);
  if (error) throw new Error(`holidays: ${error.message}`);
  return (data ?? []).map((row) => ({ day: String(row.day) }));
}