"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ApprovalBoard } from "@/lib/db/queries/head-a-approvals";
import { REASON_TEXT } from "@/lib/domain/approvals";
import { formatInr } from "@/lib/domain/money";

const BTN = "min-h-9 rounded-lg border border-border px-3 text-xs hover:bg-border/40 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
const INPUT = "h-9 w-full rounded-lg border border-border bg-background px-2 text-sm disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

type Msg = { ok: boolean; text: string } | null;

export function ApprovalsQueue({ board, locked }: { board: ApprovalBoard; locked: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const off = locked || pending;

  async function send(key: string, body: Record<string, unknown>, okText: (d: Record<string, number>) => string) {
    setBusy(key);
    setMsg(null);
    const res = await fetch("/api/head/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { ok: boolean; error?: string; data?: Record<string, number> } | null;
    setBusy(null);
    if (json?.ok) {
      setMsg({ ok: true, text: okText(json.data ?? {}) });
      startTransition(() => router.refresh());
    } else setMsg({ ok: false, text: json?.error ?? "Request failed." });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted tabular-nums">{board.pending.length} deals waiting for approval.</p>
        <button type="button" className={BTN} disabled={off || busy === "check"} onClick={() => void send("check", { action: "check" }, (d) => `Checked ${d.checked} open deals, ${d.flagged} sent for approval.`)}>
          Check open deals
        </button>
      </div>
      {msg ? <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p> : null}

      {board.pending.length === 0 ? (
        <p className="rounded-[16px] border border-dashed border-border p-6 text-sm text-muted">Nothing is waiting. Deals with 50/50 terms, in-kind above 5% or a price below the catalog minimum appear here.</p>
      ) : (
        <ul className="space-y-3">
          {board.pending.map((d) => {
            const note = notes[d.dealId] ?? "";
            const off2 = off || busy === d.dealId;
            return (
              <li key={d.dealId} className="rounded-[16px] border border-border bg-card p-4 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{d.company} <span className="ml-2 text-xs font-normal text-muted">{d.ownerName}, {d.stage.replace(/_/g, " ")}</span></p>
                  <p className="tabular-nums">{formatInr(d.proposedInr)}</p>
                </div>
                <p className="mt-1 text-xs text-muted tabular-nums">Terms {d.paymentTerms.replace("_", "/")}, in-kind {formatInr(d.inKindInr)}, waiting {d.ageBdays} business days.</p>
                <ul className="mt-2 space-y-1 text-xs">
                  {d.reasons.length === 0 ? <li className="text-muted">No rule applies any more. You can still approve or reject.</li> : null}
                  {d.reasons.map((r) => (
                    <li key={r} className="flex items-center gap-1 text-approx"><span aria-hidden className="inline-block h-2 w-2 rounded-full bg-approx" />{REASON_TEXT[r]}</li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div className="min-w-[14rem] flex-1">
                    <label htmlFor={`note-${d.dealId}`} className="text-xs text-muted">Note (required to reject)</label>
                    <input id={`note-${d.dealId}`} className={INPUT} value={note} disabled={off2} onChange={(e) => setNotes((n) => ({ ...n, [d.dealId]: e.target.value }))} />
                  </div>
                  <button type="button" className={BTN} disabled={off2} onClick={() => void send(d.dealId, { action: "approve", dealId: d.dealId, note }, () => `${d.company} approved.`)}>Approve</button>
                  <button type="button" className={BTN} disabled={off2 || !note.trim()} onClick={() => void send(d.dealId, { action: "reject", dealId: d.dealId, note }, () => `${d.company} rejected and back to negotiating.`)}>Reject</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {board.recent.length > 0 ? (
        <section className="rounded-[16px] border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Recent decisions</h2>
          <ul className="space-y-1 text-sm">
            {board.recent.map((r) => (
              <li key={r.dealId} className="flex justify-between gap-3 tabular-nums"><span>{r.company}</span><span className={r.status === "approved" ? "text-success" : "text-danger"}>{r.status} {r.at ?? ""}</span></li>
            ))}
          </ul>
        </section>
      ) : null}
      {locked ? <p className="text-xs text-approx">Locked dataset: read-only.</p> : null}
    </div>
  );
}