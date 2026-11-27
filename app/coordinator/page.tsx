import { Suspense } from "react";
import { Header } from "@/components/shell/Header";
import { CompanyDrawer } from "@/components/coordinator/CompanyDrawer";
import { CrmTable } from "@/components/coordinator/CrmTable";
import { ToastProvider } from "@/components/coordinator/ui";
import { getCtx } from "@/lib/db/queries/ctx";
import { listCompanies, type CrmFilters } from "@/lib/db/queries/crm-companies";
import { getCompanyDetail } from "@/lib/db/queries/crm-detail";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CoordinatorPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const one = (key: string): string | undefined => {
    const v = sp[key];
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };
  const ctx = await getCtx("coordinator");

  const filters: CrmFilters = {
    status: one("status"),
    channel: one("channel"),
    tier: one("tier"),
    needsUpdate: one("nu") === "1",
    q: one("q"),
    sort: (one("sort") as CrmFilters["sort"]) ?? undefined,
    dir: one("dir") === "asc" ? "asc" : one("dir") === "desc" ? "desc" : undefined,
    page: Number(one("page") ?? 1) || 1,
  };
  const companyId = one("company") ?? null;

  const header = <Header role="coordinator" eventId={ctx.eventId} memberId={ctx.memberId} />;
  if (!ctx.memberId) {
    return (
      <div className="min-h-full">
        {header}
        <main className="p-6 text-sm text-muted">No coordinator is selected for this event yet. Pick one from the header, or run the Saarang seed.</main>
      </div>
    );
  }

  const [page, detail] = await Promise.all([
    listCompanies(ctx, filters),
    companyId ? getCompanyDetail(ctx, companyId).catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <ToastProvider>
      <div className="min-h-full">
        {header}
        <main className="grid gap-4 p-4 lg:grid-cols-[minmax(0,4fr)_minmax(280px,1fr)]">
          <div className="min-w-0">
            <Suspense fallback={null}>
              <CrmTable page={page} locked={ctx.isLocked} selectedId={companyId} />
              <CompanyDrawer detail={detail} locked={ctx.isLocked} />
            </Suspense>
          </div>
          <aside className="rounded-[16px] border border-border bg-card p-6">
            <h2 className="text-sm font-semibold">To-do and assistant</h2>
            <p className="mt-2 text-sm text-muted">Needs-update list, tasks and the assistant are added in the next step.</p>
          </aside>
        </main>
      </div>
    </ToastProvider>
  );
}