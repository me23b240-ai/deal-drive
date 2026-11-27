"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DealBoard } from "@/lib/db/queries/head-b-deals";
import { formatInr } from "@/lib/domain/money";
import { EmptyBox } from "./KpiCards";

const STAGES = [
  { id: "prospecting", label: "Prospecting" },
  { id: "proposal_sent", label: "Proposal sent" },
  { id: "negotiating", label: "Negotiating" },
];

export function DealDesk({ board, locked }: { board: DealBoard; locked: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function call(dealId: string, body: Record<string, unknown>, okText: string) {
    setBusy(dealId);
    setMsg(null);
    const res = await fetch("/api/head/deals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId, ...body }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { ok: boolean; error?: string } | null;
    setBusy(null);
    if (json?.ok) {
      setMsg({ ok: true, text: okText });
      startTransition(() => router.refresh());
    } else {
      setMsg({ ok: false, text: json?.error ?? "Request failed." });
    }
  }

  if (board.rows.length === 0) return <EmptyBox message="No open deals. A company appears here once it reaches Prospective." />;
  const disabled = locked || pending;
  const select = "h-9 rounded-lg border border-border bg-background px-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50";
  const btn = "min-h-9 rounded-lg border border-border px-3 text-xs hover:bg-border/40 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted tabular-nums">
        {board.rows.length} open deals worth {formatInr(board.totalInr)}. Top 5 hold {formatInr(board.top5Inr)}
        {board.top5Share === null ? "" : ` (${Math.round(board.top5Share * 1000) / 10}% of the total)`}.
      </p>
      {msg ? (
        <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>
      ) : null}
      <div className="overflow-x-auto rounded-[16px] border border-border">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="px-3 py-3 text-left font-medium">Company</th>
              <th scope="col" className="px-3 py-3 text-left font-medium">Owner</th>
              <th scope="col" className="px-3 py-3 text-left font-medium">Stage</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Amount</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Idle</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Nudges</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Next follow-up</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {board.rows.map((r) => {
              const due = r.nextFollowUp !== null && r.nextFollowUp <= board.today;
              const off = disabled || busy === r.dealId;
              return (
                <tr key={r.dealId} className={`border-b border-border/60 ${r.isTop5 ? "bg-accent/5" : ""}`}>
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {r.company}
                    {r.isTop5 ? <span className="ml-2 rounded-full border border-accent/50 px-2 py-0.5 text-xs font-semibold text-accent">TOP 5</span> : null}
                  </th>
                  <td className="whitespace-nowrap px-3 py-2">{r.ownerName}</td>
                  <td className="px-3 py-2">
                    <label className="sr-only" htmlFor={`stage-${r.dealId}`}>Stage for {r.company}</label>
                    <select
                      id={`stage-${r.dealId}`}
                      className={select}
                      value={r.stage}
                      disabled={off}
                      onChange={(e) => void call(r.dealId, { action: "stage", stage: e.target.value }, `${r.company} moved to ${e.target.value.replace("_", " ")}.`)}
                    >
                      {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatInr(r.proposedInr)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {r.idleBdays > 3 ? (
                      <span className={`inline-flex items-center gap-1 ${r.idleBdays > 10 ? "text-danger" : "text-approx"}`}>
                        <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${r.idleBdays > 10 ? "bg-danger" : "bg-approx"}`} />
                        {r.idleBdays} bdays idle
                      </span>
                    ) : (
                      `${r.idleBdays} bdays`
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.nudges}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {r.nextFollowUp ?? "-"}
                    {due ? <span className="ml-2 text-xs text-approx">due</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button type="button" disabled={off} className={btn} onClick={() => void call(r.dealId, { action: "nudge" }, `Nudge logged for ${r.company}.`)}>
                      Nudge
                    </button>{" "}
                    <button type="button" disabled={off} className={btn} onClick={() => void call(r.dealId, { action: "escalate" }, `Escalation task created for the owner of ${r.company}.`)}>
                      Escalate
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {locked ? <p className="text-xs text-approx">Locked dataset: read-only.</p> : null}
    </div>
  );
}