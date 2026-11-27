"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { InitiativeBoard, InitiativeCardData } from "@/lib/db/queries/head-a-initiatives";
import { formatInr, formatLakh } from "@/lib/domain/money";

const BADGE: Record<string, string> = {
  SCALE: "border-success/50 text-success",
  CHANGE: "border-approx/50 text-approx",
  STOP: "border-danger/50 text-danger",
  BEHIND: "border-danger/50 text-danger",
  HOLD: "border-border text-muted",
  "TOO EARLY": "border-border text-muted",
};
const STATUSES = ["active", "paused", "stopped", "done"];

function Card({ c, locked }: { c: InitiativeCardData; locked: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [budget, setBudget] = useState(String(c.budgetInr));
  const [spend, setSpend] = useState(String(c.spendInr));
  const [status, setStatus] = useState(c.status);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function save() {
    const body: Record<string, unknown> = { id: c.campaignId };
    if (Number(budget) !== c.budgetInr) body.budget = Number(budget);
    if (Number(spend) !== c.spendInr) body.spend = Number(spend);
    if (status !== c.status) body.status = status;
    if (Object.keys(body).length === 1) {
      setFailed(false);
      setMsg("No changes to save.");
      return;
    }
    if (!Number.isFinite(Number(budget)) || !Number.isFinite(Number(spend)) || Number(budget) < 0 || Number(spend) < 0) {
      setFailed(true);
      setMsg("Budget and spend must be zero or more.");
      return;
    }
    const res = await fetch("/api/head/initiatives", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { ok: boolean; error?: string } | null;
    if (json?.ok) {
      setFailed(false);
      setMsg("Saved.");
      startTransition(() => router.refresh());
    } else {
      setFailed(true);
      setMsg(json?.error ?? "Could not save.");
    }
  }

  const input = "h-10 w-full rounded-lg border border-border bg-background px-2 text-sm tabular-nums disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
  const id = (s: string) => `${c.code}-${s}`;
  return (
    <article className="space-y-4 rounded-[16px] border border-border bg-card p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">{c.code}</p>
          <h2 className="text-base font-semibold">{c.name}</h2>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${BADGE[c.badge] ?? ""}`}>{c.badge}</span>
      </header>
      <p className="text-sm text-muted">{c.reason}</p>
      {c.concept ? <p className="text-sm">{c.concept}</p> : null}

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-muted">Owner</dt><dd>{c.owner ?? "Unassigned"}</dd></div>
        <div><dt className="text-xs text-muted">Dates</dt><dd className="tabular-nums">{c.startDate ?? "-"} to {c.endDate ?? "-"}</dd></div>
        <div>
          <dt className="text-xs text-muted">Expected stretch (ASSUMED)</dt>
          <dd className="tabular-nums">{c.expectedInr === null ? "-" : formatLakh(c.expectedInr)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Live attribution over floor</dt>
          <dd className="tabular-nums">{c.liveInr === null ? "-" : formatLakh(c.liveInr)}</dd>
        </div>
      </dl>

      {c.kpis.length > 0 ? (
        <div>
          <p className="text-xs text-muted">KPIs</p>
          <ul className="list-inside list-disc text-sm">{c.kpis.map((k) => <li key={k}>{k}</li>)}</ul>
        </div>
      ) : null}

      <div className="space-y-1 text-xs text-muted">
        {(["scale", "change", "stop"] as const).map((k) => (
          <p key={k}>
            <span className="font-semibold uppercase">{k}</span>:{" "}
            {c.rules[k].length ? c.rules[k].join(" and ") : "no rule"}
          </p>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 border-t border-border pt-4">
        <div>
          <label htmlFor={id("budget")} className="text-xs text-muted">Budget</label>
          <input id={id("budget")} className={input} inputMode="numeric" value={budget} disabled={locked} onChange={(e) => setBudget(e.target.value)} />
        </div>
        <div>
          <label htmlFor={id("spend")} className="text-xs text-muted">Spend</label>
          <input id={id("spend")} className={input} inputMode="numeric" value={spend} disabled={locked} onChange={(e) => setSpend(e.target.value)} />
        </div>
        <div>
          <label htmlFor={id("status")} className="text-xs text-muted">Status</label>
          <select id={id("status")} className={input} value={status} disabled={locked} onChange={(e) => setStatus(e.target.value)}>
            {[...new Set([c.status, ...STATUSES])].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={locked || pending}
          className="min-h-11 rounded-[16px] bg-accent px-4 text-sm font-medium text-background disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Save
        </button>
        <p className="text-xs text-muted tabular-nums">Budget {formatInr(Number(budget) || 0)}, spend {formatInr(Number(spend) || 0)}</p>
        {msg ? <p role={failed ? "alert" : "status"} className={`text-xs ${failed ? "text-danger" : "text-success"}`}>{msg}</p> : null}
        {locked ? <p className="text-xs text-approx">Locked dataset: read-only.</p> : null}
      </div>
    </article>
  );
}

function Experiment({ board }: { board: InitiativeBoard }) {
  const e = board.experiment;
  if (!e) return null;
  const rate = (r: number | null) => (r === null ? "no data" : `${Math.round(r * 1000) / 10}%`);
  return (
    <section className="rounded-[16px] border border-border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">bet-5 experiment: personalised vs template opening</h2>
        <span className="rounded-full border border-approx/40 px-2 py-0.5 text-xs text-approx">SIMULATED</span>
        {e.directionalOnly ? <span className="rounded-full border border-approx/40 px-2 py-0.5 text-xs text-approx">directional only</span> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="px-3 py-2 text-left font-medium">Arm</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Sent (n)</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Reached proposal</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Rate</th>
            </tr>
          </thead>
          <tbody>
            {([["Personalised", e.personalised], ["Template (control)", e.template]] as const).map(([label, a]) => (
              <tr key={label} className="border-b border-border/60">
                <th scope="row" className="px-3 py-2 text-left font-normal">{label}</th>
                <td className="px-3 py-2 text-right tabular-nums">{a.n}</td>
                <td className="px-3 py-2 text-right tabular-nums">{a.reached}</td>
                <td className="px-3 py-2 text-right tabular-nums">{rate(a.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-muted">
        {e.ratio === undefined ? "Ratio: insufficient data (the template arm has no proposals yet)." : `Personalised vs template ratio: ${e.ratio.toFixed(2)}x.`}{" "}
        Results stay directional until each arm has about 100 sends.
      </p>
    </section>
  );
}

export function InitiativeCards({ board, locked }: { board: InitiativeBoard; locked: boolean }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted tabular-nums">
        Total budget {formatInr(board.totalBudgetInr)} (ASSUMED), total spend {formatInr(board.totalSpendInr)}.
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        {board.cards.map((c) => <Card key={c.campaignId} c={c} locked={locked} />)}
      </div>
      <Experiment board={board} />
    </div>
  );
}