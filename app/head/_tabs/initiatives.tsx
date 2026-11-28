import { EmptyBox, ErrorBox } from "@/components/head/KpiCards";
import { SourceScorecardSection } from "@/components/head/SourceScorecardSection";
import { InitiativeCards } from "@/components/head/InitiativeCards";
import { errorMessage } from "@/lib/db/errors";
import { getInitiativeBoard, type InitiativeBoard } from "@/lib/db/queries/head-a-initiatives";
import type { Ctx } from "@/lib/types";

export default async function InitiativesTab({ ctx }: { ctx: Ctx }) {
  let board: InitiativeBoard;
  try {
    board = await getInitiativeBoard(ctx);
  } catch (error) {
    return <ErrorBox message={errorMessage(error)} />;
  }
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Initiatives</h1>
      {board.cards.length === 0 ? (
        <EmptyBox message="No initiatives found for this event. Run the Saarang seed." />
      ) : (
        <><InitiativeCards board={board} locked={ctx.isLocked} /><SourceScorecardSection ctx={ctx} /></>
      )}
    </div>
  );
}