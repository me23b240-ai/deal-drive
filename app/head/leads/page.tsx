import Link from "next/link";
import { EmptyBox, ErrorBox } from "@/components/head/KpiCards";
import { LeadIntake } from "@/components/head/LeadIntake";
import { Header } from "@/components/shell/Header";
import { errorMessage } from "@/lib/db/errors";
import { getCtx } from "@/lib/db/queries/ctx";
import { getLeadsBoard, type LeadsBoard } from "@/lib/db/queries/head-a-leads";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const ctx = await getCtx("head");
  let board: LeadsBoard | null = null;
  let error: string | null = null;
  if (ctx.eventId === "saarang-2027") {
    try {
      board = await getLeadsBoard(ctx);
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
          <h1 className="text-lg font-semibold">Lead intake</h1>
          <span className="rounded-full border border-approx/40 px-2 py-0.5 text-xs text-approx">SIMULATED data</span>
        </div>
        {error ? <ErrorBox message={error} /> : null}
        {ctx.eventId !== "saarang-2027" ? <EmptyBox message="Lead intake is only available for the Saarang 2027 event." /> : null}
        {board ? <LeadIntake board={board} locked={ctx.isLocked} /> : null}
      </main>
    </div>
  );
}