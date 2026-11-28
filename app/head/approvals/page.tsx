import Link from "next/link";
import { ApprovalsQueue } from "@/components/head/ApprovalsQueue";
import { EmptyBox, ErrorBox } from "@/components/head/KpiCards";
import { Header } from "@/components/shell/Header";
import { errorMessage } from "@/lib/db/errors";
import { getCtx } from "@/lib/db/queries/ctx";
import { getApprovalBoard, type ApprovalBoard } from "@/lib/db/queries/head-a-approvals";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const ctx = await getCtx("head");
  let board: ApprovalBoard | null = null;
  let error: string | null = null;
  if (ctx.eventId === "saarang-2027") {
    try {
      board = await getApprovalBoard(ctx);
    } catch (e) {
      error = errorMessage(e);
    }
  }
  return (
    <div className="min-h-full">
      <Header role="head" eventId={ctx.eventId} memberId={ctx.memberId} />
      <main className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/head" className="text-sm text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">Back to Head</Link>
          <h1 className="text-lg font-semibold">Approvals</h1>
        </div>
        {error ? <ErrorBox message={error} /> : null}
        {ctx.eventId !== "saarang-2027" ? <EmptyBox message="Approvals are only available for the Saarang 2027 event." /> : null}
        {board ? <ApprovalsQueue board={board} locked={ctx.isLocked} /> : null}
      </main>
    </div>
  );
}