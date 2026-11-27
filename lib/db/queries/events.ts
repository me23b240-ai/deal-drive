import { getServiceClient } from "@/lib/db/client";

export type EventRow = {
  id: string;
  name: string;
  is_seed: boolean;
};

export async function listEvents(): Promise<EventRow[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, name, is_seed")
    .order("id");
  if (error) throw error;
  return (data ?? []) as EventRow[];
}

export async function getEvent(eventId: string): Promise<EventRow | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, name, is_seed")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  return data as EventRow | null;
}
