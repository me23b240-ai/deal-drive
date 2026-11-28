import Link from "next/link";
import { Header } from "@/components/shell/Header";
import { SlabBuilder } from "@/components/coordinator/SlabBuilder";
import { ToastProvider } from "@/components/coordinator/ui";
import { getCtx } from "@/lib/db/queries/ctx";
import { getSlabState, type SlabState } from "@/lib/db/queries/crm-slab";

export default async function SlabPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const ctx = await getCtx("coordinator");
  let state: SlabState | null = null;
  let problem: string | null = null;
  try {
    state = await getSlabState(ctx, brandId);
  } catch (error) {
    problem = error instanceof Error ? error.message : "The slab couldn't be loaded.";
  }
  return (
    <ToastProvider>
      <div className="min-h-full">
        <Header role="coordinator" eventId={ctx.eventId} memberId={ctx.memberId} />
        <main className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-lg font-semibold">Slab builder{state ? `: ${state.brand.name}` : ""}</h1>
            <Link className="text-sm text-accent underline" href={`/coordinator?company=${brandId}`}>
              Back to the company
            </Link>
          </div>
          {state ? (
            <>
              <p className="text-sm text-muted">
                Deal stage: {state.deal.stage.replace("_", " ")}. Saving updates the deal value, so the Deal desk and the plan follow.
              </p>
              <SlabBuilder state={state} locked={ctx.isLocked} />
            </>
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