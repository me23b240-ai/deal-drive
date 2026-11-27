import { ErrorBox } from "@/components/head/KpiCards";
import { TeamTable } from "@/components/head/TeamTable";
import { errorMessage } from "@/lib/db/errors";
import { getTeamTable, type TeamTableData } from "@/lib/db/queries/head-a-team";
import type { Ctx } from "@/lib/types";

export default async function TeamTab({ ctx }: { ctx: Ctx }) {
  let data: TeamTableData;
  try {
    data = await getTeamTable(ctx);
  } catch (error) {
    return <ErrorBox message={errorMessage(error)} />;
  }
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Team</h1>
      <TeamTable data={data} />
    </div>
  );
}