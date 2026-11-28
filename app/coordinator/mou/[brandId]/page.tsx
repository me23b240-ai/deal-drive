import Link from "next/link";
import { Header } from "@/components/shell/Header";
import { MouEditor } from "@/components/coordinator/MouEditor";
import { ToastProvider } from "@/components/coordinator/ui";
import { getCtx } from "@/lib/db/queries/ctx";
import { getMouState, type MouState } from "@/lib/db/queries/crm-mou";

export default async function MouPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const ctx = await getCtx("coordinator");
  let state: MouState | null = null;
  let problem: string | null = null;
  try {
    state = await getMouState(ctx, brandId);
  } catch (error) {
    problem = error instanceof Error ? error.message : "The MoU couldn't be loaded.";
  }
  return (
    <ToastProvider>
      <div className="min-h-full">
        <div className="print:hidden">
          <Header role="coordinator" eventId={ctx.eventId} memberId={ctx.memberId} />
        </div>
        <main className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 print:hidden">
            <h1 className="text-lg font-semibold">MoU{state ? `: ${state.brand.name}` : ""}</h1>
            <span className="flex gap-4 text-sm">
              <Link className="text-accent underline" href={`/coordinator/slab/${brandId}`}>
                Slab builder
              </Link>
              <Link className="text-accent underline" href={`/coordinator?company=${brandId}`}>
                Back to the company
              </Link>
            </span>
          </div>
          {state ? (
            <MouEditor state={state} locked={ctx.isLocked} />
          ) : (
            <p role="alert" className="rounded-lg border border-border bg-card p-6 text-sm text-danger">
              {problem}
            </p>
          )}
        </main>
      </div>
    </ToastProvider>
  );
}