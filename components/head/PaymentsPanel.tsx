"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PaymentsData } from "@/lib/db/queries/head-b-payments";
import { formatInr } from "@/lib/domain/money";
import { EmptyBox } from "./KpiCards";

const PHASE: Record<string, string> = { pre_fest: "Pre-fest", post_fest: "Post-fest" };

export function PaymentsPanel({ data, locked }: { data: PaymentsData; locked: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function mark(id: string, received: boolean) {
    setBusy(id);
    setMsg(null);
    const res = await fetch("/api/head/payments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, received }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { ok: boolean; error?: string } | null;
    setBusy(null);
    if (json?.ok) {
      setMsg({ ok: true, text: received ? "Marked received." : "Marked pending." });
      startTransition(() => router.refresh());
    } else {
      setMsg({ ok: false, text: json?.error ?? "Request failed." });
    }
  }

  if (data.rows.length === 0) return <EmptyBox message="No payments yet. They are created when a company is converted (cash portion only)." />;
  const disabled = locked || pending;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Scheduled", data.scheduledInr],
          ["Collected", data.collectedInr],
          ["Pending", data.pendingInr],
        ].map(([label, v]) => (
          <div key={String(label)} className="rounded-[16px] border border-border p-3">
            <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatInr(Number(v))}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted tabular-nums">
        {data.byPhase.map((p) => `${PHASE[p.phase] ?? p.phase}: ${formatInr(p.collectedInr)} of ${formatInr(p.scheduledInr)}`).join(" | ")}
      </p>
      {msg ? <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p> : null}
      <div className="overflow-x-auto rounded-[16px] border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="px-3 py-3 text-left font-medium">Company</th>
              <th scope="col" className="px-3 py-3 text-left font-medium">Phase</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Amount</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Due</th>
              <th scope="col" className="px-3 py-3 text-left font-medium">Status</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((p) => (
              <tr key={p.id} className="border-b border-border/60">
                <th scope="row" className="px-3 py-2 text-left font-medium">{p.company}</th>
                <td className="px-3 py-2">{PHASE[p.phase] ?? p.phase}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatInr(p.amountInr)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{p.dueDate ?? "-"}</td>
                <td className="px-3 py-2">
                  {p.receivedAt ? (
                    <span className="inline-flex items-center gap-1 text-success">
                      <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-success" />
                      Received {p.receivedAt.slice(0, 10)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-approx">
                      <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-approx" />
                      Pending
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    disabled={disabled || busy === p.id}
                    onClick={() => void mark(p.id, !p.receivedAt)}
                    className="min-h-9 rounded-lg border border-border px-3 text-xs hover:bg-border/40 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {p.receivedAt ? "Undo" : "Mark received"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {locked ? <p className="text-xs text-approx">Locked dataset: read-only.</p> : null}
    </div>
  );
}