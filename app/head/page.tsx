import Link from "next/link";
import { Suspense } from "react";
import { Header } from "@/components/shell/Header";
import { getCtx } from "@/lib/db/queries/ctx";
import type { Ctx } from "@/lib/types";
import BenchmarkTab from "./_tabs/benchmark";
import DataLabTab from "./_tabs/data-lab";
import DealDeskTab from "./_tabs/deal-desk";
import EodTab from "./_tabs/eod";
import InitiativesTab from "./_tabs/initiatives";
import InventoryTab from "./_tabs/inventory";
import OverviewTab from "./_tabs/overview";
import PlanTab from "./_tabs/plan";
import RisksTab from "./_tabs/risks";
import SettingsTab from "./_tabs/settings";
import TeamTab from "./_tabs/team";

export const dynamic = "force-dynamic";

type Tab = { id: string; label: string };

const SAARANG_TABS: Tab[] = [
  { id: "overview", label: "Overview" },
  { id: "plan", label: "Plan" },
  { id: "initiatives", label: "Initiatives" },
  { id: "deal-desk", label: "Deal desk" },
  { id: "team", label: "Team" },
  { id: "risks", label: "Risks & decisions" },
  { id: "settings", label: "Settings" },
  { id: "eod", label: "EOD" },
  { id: "inventory", label: "Inventory" },
];

function tabsFor(ctx: Ctx): Tab[] {
  if (!ctx.eventId.startsWith("campusfest")) return SAARANG_TABS;
  const tabs: Tab[] = [{ id: "benchmark", label: "Benchmark" }];
  if (ctx.eventId === "campusfest-2025-work") tabs.push({ id: "data-lab", label: "Data lab" });
  return tabs;
}

function renderTab(id: string, ctx: Ctx) {
  switch (id) {
    case "plan": return <PlanTab ctx={ctx} />;
    case "initiatives": return <InitiativesTab ctx={ctx} />;
    case "deal-desk": return <DealDeskTab ctx={ctx} />;
    case "team": return <TeamTab ctx={ctx} />;
    case "risks": return <RisksTab ctx={ctx} />;
    case "settings": return <SettingsTab ctx={ctx} />;
    case "eod": return <EodTab ctx={ctx} />;
    case "inventory": return <InventoryTab ctx={ctx} />;
    case "benchmark": return <BenchmarkTab ctx={ctx} />;
    case "data-lab": return <DataLabTab ctx={ctx} />;
    default: return <OverviewTab ctx={ctx} />;
  }
}

function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">Loading</span>
      <div className="h-24 animate-pulse rounded-[16px] bg-card motion-reduce:animate-none" />
      <div className="h-64 animate-pulse rounded-[16px] bg-card motion-reduce:animate-none" />
    </div>
  );
}

export default async function HeadPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const ctx = await getCtx("head");
  const raw = (await searchParams).tab;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  const tabs = tabsFor(ctx);
  const active = tabs.find((t) => t.id === requested)?.id ?? tabs[0]?.id ?? "overview";

  return (
    <div className="min-h-full">
      <Header role="head" eventId={ctx.eventId} memberId={ctx.memberId} />
      <main className="space-y-6 p-4 sm:p-6">
        <nav aria-label="Head sections" className="overflow-x-auto">
          <ul className="flex min-w-max gap-2">
            {tabs.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/head?tab=${t.id}`}
                  aria-current={t.id === active ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                    t.id === active ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <Suspense key={`${ctx.eventId}:${active}`} fallback={<Loading />}>
          {renderTab(active, ctx)}
        </Suspense>
      </main>
    </div>
  );
}