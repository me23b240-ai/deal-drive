import { Suspense } from "react";
import { Header } from "@/components/shell/Header";
import { CompanyDrawer } from "@/components/coordinator/CompanyDrawer";
import { CoordTabs, type CoordTab } from "@/components/coordinator/CoordTabs";
import { CrmTable } from "@/components/coordinator/CrmTable";
import { DealDesk } from "@/components/coordinator/DealDesk";
import { DraftPanel } from "@/components/coordinator/DraftPanel";
import { EodDialog } from "@/components/coordinator/EodDialog";
import { ImportPanel } from "@/components/coordinator/ImportPanel";
import { QueuePanel } from "@/components/coordinator/QueuePanel";
import { TodoRail } from "@/components/coordinator/TodoRail";
import { ToastProvider } from "@/components/coordinator/ui";
import { WeeklyStrip } from "@/components/coordinator/WeeklyStrip";
import { getCtx } from "@/lib/db/queries/ctx";
import { listCompanies, type CrmFilters } from "@/lib/db/queries/crm-companies";
import { listOpenDeals } from "@/lib/db/queries/crm-deals";
import { getComposerState, getDraftQueue } from "@/lib/db/queries/crm-drafts";
import { getEodState } from "@/lib/db/queries/crm-eod";
import { getDetailWithPipeline } from "@/lib/db/queries/crm-mou";
import { getMyQueue } from "@/lib/db/queries/crm-queue";
import { listTasks } from "@/lib/db/queries/crm-tasks";
import { listTeam } from "@/lib/db/queries/team";
import { getNeedsUpdate } from "@/lib/db/queries/views";
import { getWeeklyStrip } from "@/lib/db/queries/weekly";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CoordinatorPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const one = (key: string): string | undefined => {
    const v = sp[key];
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };
  const ctx = await getCtx("coordinator");
  const header = <Header role="coordinator" eventId={ctx.eventId} memberId={ctx.memberId} />;

  if (!ctx.memberId) {
    return (
      <div className="min-h-full">
        {header}
        <main className="p-6 text-sm text-muted">No coordinator is selected for this event yet. Pick one from the header, or run the Saarang seed.</main>
      </div>
    );
  }

  const raw = one("tab");
  const tab: CoordTab = raw === "deals" || raw === "drafts" || raw === "import" || raw === "queue" ? raw : "crm";
  const selected = one("company") ?? null;
  const filters: CrmFilters = {
    status: one("status"),
    channel: one("channel"),
    tier: one("tier"),
    needsUpdate: one("nu") === "1",
    q: one("q"),
    sort: one("sort") as CrmFilters["sort"] | undefined,
    dir: one("dir") === "asc" ? "asc" : one("dir") === "desc" ? "desc" : undefined,
    page: Number(one("page") ?? 1) || 1,
  };

  const [strip, needs, tasks, team, eod] = await Promise.all([getWeeklyStrip(ctx), getNeedsUpdate(ctx), listTasks(ctx), listTeam(ctx.eventId), getEodState(ctx)]);
  const nameOf = Object.fromEntries(team.map((m) => [m.id, m.name]));

  let main;
  if (tab === "deals") {
    main = <DealDesk deals={await listOpenDeals(ctx)} nameOf={nameOf} showOwner={ctx.isCloser} meId={ctx.memberId} locked={ctx.isLocked} />;
  } else if (tab === "queue") {
    const q = await getMyQueue(ctx);
    main = <QueuePanel leads={q.leads} error={q.error} locked={ctx.isLocked} />;
  } else if (tab === "import") {
    main = <ImportPanel />;
  } else if (tab === "drafts") {
    const [queue, state] = await Promise.all([getDraftQueue(ctx), selected ? getComposerState(ctx, selected).catch(() => null) : Promise.resolve(null)]);
    main = <DraftPanel queue={queue} state={state} selectedId={selected} locked={ctx.isLocked} />;
  } else {
    const [page, detail] = await Promise.all([listCompanies(ctx, filters), selected ? getDetailWithPipeline(ctx, selected).catch(() => null) : Promise.resolve(null)]);
    main = (
      <>
        <CrmTable page={page} locked={ctx.isLocked} selectedId={selected} />
        <CompanyDrawer detail={detail} locked={ctx.isLocked} />
      </>
    );
  }

  return (
    <ToastProvider>
      <div className="min-h-full">
        {header}
        <main className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-lg font-semibold">My day</h1>
            <div className="flex flex-wrap items-center gap-3">
              <a className="text-sm text-accent underline" href="/coordinator/peer-fests">
                Peer fests
              </a>
              <a className="text-sm text-accent underline" href="/coordinator/intros">
                Intro log
              </a>
              <EodDialog state={eod} locked={ctx.isLocked} />
            </div>
          </div>
          <WeeklyStrip data={strip} />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,4fr)_minmax(280px,1fr)]">
            <div className="flex min-w-0 flex-col gap-3">
              <Suspense fallback={null}>
                <CoordTabs active={tab} />
                {main}
              </Suspense>
            </div>
            <TodoRail needs={needs} tasks={tasks} today={ctx.todayIst} locked={ctx.isLocked} />
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}