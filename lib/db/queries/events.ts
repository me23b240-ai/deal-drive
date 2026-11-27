import { getServiceClient } from "@/lib/db/client";
import type { EventInfo } from "@/lib/types";

const COLUMNS = "id, name, is_seed, starts_at, ends_at, as_of, weekly_target_default, model_assumptions";

export type EventRow = Pick<EventInfo, "id" | "name" | "is_seed">;

function toInfo(row: Record<string, unknown>): EventInfo {
  return {
    id: String(row.id),
    name: String(row.name ?? row.id),
    is_seed: Boolean(row.is_seed),
    starts_at: (row.starts_at as string | null) ?? null,
    ends_at: (row.ends_at as string | null) ?? null,
    as_of: (row.as_of as string | null) ?? null,
    weekly_target_default: typeof row.weekly_target_default === "number" ? row.weekly_target_default : 10,
    model_assumptions:
      row.model_assumptions && typeof row.model_assumptions === "object"
        ? (row.model_assumptions as Record<string, unknown>)
        : {},
  };
}

export function fallbackEvent(id: string): EventInfo {
  return {
    id,
    name: id,
    is_seed: id === "campusfest-2025",
    starts_at: null,
    ends_at: null,
    as_of: null,
    weekly_target_default: 10,
    model_assumptions: {},
  };
}

export async function listEvents(): Promise<EventInfo[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from("events").select(COLUMNS).order("id");
  if (error) throw new Error(`events: ${error.message}`);
  return (data ?? []).map((row) => toInfo(row as Record<string, unknown>));
}

export async function getEventInfo(eventId: string): Promise<EventInfo | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from("events").select(COLUMNS).eq("id", eventId).maybeSingle();
  if (error) throw new Error(`events: ${error.message}`);
  return data ? toInfo(data as Record<string, unknown>) : null;
}

export const getEvent = getEventInfo;