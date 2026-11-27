import type { ReactNode } from "react";
import type { HeadKpis } from "@/lib/db/queries/overview";
import { formatInr, formatLakh } from "@/lib/domain/money";

export function Card(props: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[16px] border border-border bg-card p-5 ${props.className ?? ""}`}>
      {props.title ? <h2 className="mb-3 text-sm font-semibold">{props.title}</h2> : null}
      {props.children}
    </section>
  );
}

export function ErrorBox(props: { message: string }) {
  return (
    <section role="alert" className="rounded-[16px] border border-danger/40 bg-danger/10 p-5 text-sm">
      <span className="font-semibold text-danger">Could not load this tab.</span>
      <span className="ml-2 text-muted">{props.message}</span>
    </section>
  );
}

export function EmptyBox(props: { message: string }) {
  return <p className="rounded-[16px] border border-dashed border-border p-6 text-sm text-muted">{props.message}</p>;
}

function Kpi(props: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[16px] border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-muted">{props.label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{props.value}</p>
      {props.sub ? <p className="mt-1 text-xs text-muted">{props.sub}</p> : null}
    </div>
  );
}

export function KpiCards(props: { kpis: HeadKpis; signedCashInr: number; signedInKindInr: number }) {
  const { kpis, signedCashInr, signedInKindInr } = props;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Kpi label="Total companies outreached" value={String(kpis.outreached)} sub={`${kpis.companies} companies in the CRM`} />
      <Kpi
        label="Responded"
        value={String(kpis.responded)}
        sub={kpis.outreached > 0 ? `${Math.round((100 * kpis.responded) / kpis.outreached)}% of outreached` : "No outreach yet"}
      />
      <Kpi label="Prospective" value={String(kpis.prospective.count)} sub={`${formatLakh(kpis.prospective.inr)} approx amount`} />
      <Kpi label="Converted" value={String(kpis.converted)} sub={`${kpis.signedDeals} confirmed deals`} />
      <Kpi
        label="Signed"
        value={formatLakh(kpis.signedInr)}
        sub={`Cash ${formatLakh(signedCashInr)} + in-kind ${formatLakh(signedInKindInr)}`}
      />
      <Kpi
        label="Cash collected"
        value={formatInr(kpis.cashCollectedInr)}
        sub={`${formatInr(kpis.cashScheduledInr)} scheduled, ${formatInr(kpis.cashPendingInr)} pending`}
      />
    </div>
  );
}