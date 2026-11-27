import { getServiceClient } from "@/lib/db/client";
import type { TeamMember } from "@/lib/types";

export async function listTeam(eventId: string): Promise<TeamMember[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("team_members")
    .select("id, source_id, name, role, is_closer")
    .eq("event_id", eventId)
    .order("name");
  if (error) throw new Error(`team_members: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    source_id: (row.source_id as string | null) ?? null,
    name: String(row.name),
    role: row.role === "manager" ? "manager" : "member",
    is_closer: Boolean(row.is_closer),
  }));
}

export function coordinatorsOf(team: TeamMember[]): TeamMember[] {
  return team.filter((member) => member.role === "member");
}