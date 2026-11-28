"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const INPUT = "h-10 w-full rounded-lg border border-border bg-background px-2 text-sm disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

export function PlanExtrasForm(props: { discountPct: number; deadline: string; sectors: string[]; locked: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [disc, setDisc] = useState(String(props.discountPct));
  const [deadline, setDeadline] = useState(props.deadline);
  const [sectors, setSectors] = useState(props.sectors.join(", "));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const off = props.locked || busy || pending;

  async function save() {
    if (disc.trim() === "" || !Number.isFinite(Number(disc))) return setMsg({ ok: false, text: "The discount must be a number." });
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/head/plan-extras", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discountPct: Number(disc), deadline, sectors: sectors.split(",") }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { ok: boolean; error?: string } | null;
    setBusy(false);
    if (json?.ok) {
      setMsg({ ok: true, text: "Saved." });
      startTransition(() => router.refresh());
    } else setMsg({ ok: false, text: json?.error ?? "Request failed." });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="eb-disc" className="text-xs text-muted">Early-bird discount (%)</label>
          <input id="eb-disc" className={INPUT} inputMode="decimal" value={disc} disabled={off} onChange={(e) => setDisc(e.target.value)} />
        </div>
        <div>
          <label htmlFor="eb-date" className="text-xs text-muted">Early-bird deadline</label>
          <input id="eb-date" type="date" className={INPUT} value={deadline} disabled={off} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <div>
          <label htmlFor="eb-sec" className="text-xs text-muted">Exclusive sectors (comma separated)</label>
          <input id="eb-sec" className={INPUT} value={sectors} disabled={off} onChange={(e) => setSectors(e.target.value)} />
        </div>
      </div>
      <button type="button" disabled={off} onClick={() => void save()} className="min-h-11 rounded-[16px] bg-accent px-4 text-sm font-medium text-background disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        Save
      </button>
      {msg ? <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p> : null}
      {props.locked ? <p className="text-xs text-approx">Locked dataset: read-only.</p> : null}
      <p className="text-xs text-muted">ASSUMED. The early-bird share of signed deals feeds the bet-3 scorecard.</p>
    </div>
  );
}