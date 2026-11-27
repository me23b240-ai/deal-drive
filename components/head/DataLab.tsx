"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { DataLabData, OppRow } from "@/lib/db/queries/head-b-datalab";
import { formatInr } from "@/lib/domain/money";

const INPUT = "h-9 w-full rounded-lg border border-border bg-background px-2 text-sm tabular-nums disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
const BTN = "min-h-9 rounded-lg border border-border px-3 text-xs hover:bg-border/40 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
const BTN1 = "min-h-11 rounded-[16px] bg-accent px-4 text-sm font-medium text-background disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

type Msg = { ok: boolean; text: string } | null;
type Report = {
  counts?: Record<string, number>;
  removedDuplicates?: { interactions: number; qualification: number; history: number };
  skipped?: { orphanRows: number; afterCutoff: number; unknownOrigin: number };
};

function Note({ msg }: { msg: Msg }) {
  return msg ? <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p> : null;
}

function ReportView({ r }: { r: Report }) {
  return (
    <div className="space-y-1 rounded-[16px] border border-border p-3 text-xs text-muted tabular-nums">
      <p>Loaded: {Object.entries(r.counts ?? {}).map(([k, v]) => `${k} ${v}`).join(", ")}</p>
      {r.removedDuplicates ? <p>Duplicates removed: interactions {r.removedDuplicates.interactions}, qualification {r.removedDuplicates.qualification}, history {r.removedDuplicates.history}</p> : null}
      {r.skipped ? <p>Skipped: orphan rows {r.skipped.orphanRows}, after cutoff {r.skipped.afterCutoff}, unknown origin {r.skipped.unknownOrigin}</p> : null}
    </div>
  );
}

function LoadPanel() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  async function run(url: string, body: FormData | undefined, okText: string) {
    setBusy(true);
    setMsg(null);
    setReport(null);
    const res = await fetch(url, { method: "POST", body }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { ok: boolean; error?: string; data?: Report } | null;
    setBusy(false);
    setConfirmReset(false);
    if (json?.ok) {
      setMsg({ ok: true, text: okText });
      setReport(json.data ?? null);
      startTransition(() => router.refresh());
    } else {
      setMsg({ ok: false, text: `${json?.error ?? "Request failed."} If the file failed validation your data is unchanged; otherwise use Reset to original.` });
    }
  }

  function upload() {
    const f = file.current?.files?.[0];
    if (!f) return setMsg({ ok: false, text: "Choose an .xlsx file first." });
    const fd = new FormData();
    fd.append("file", f);
    void run("/api/campusfest/upload", fd, "Workbook loaded into the working copy. Benchmark now uses it.");
  }

  const off = busy || pending;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="dl-file" className="text-xs text-muted">Modified dataset (.xlsx, same sheets as the original)</label>
          <input id="dl-file" ref={file} type="file" accept=".xlsx" disabled={off} className="mt-1 block text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-card file:px-3 file:py-2 file:text-xs" />
        </div>
        <button type="button" className={BTN1} disabled={off} onClick={upload}>Upload and reload</button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {confirmReset ? (
          <>
            <span className="text-sm">Replace the working copy with the original dataset?</span>
            <button type="button" className={BTN} disabled={off} onClick={() => void run("/api/campusfest/reset", undefined, "Working copy reset to the original dataset.")}>Confirm reset</button>
            <button type="button" className={BTN} onClick={() => setConfirmReset(false)}>Cancel</button>
          </>
        ) : (
          <button type="button" className={BTN} disabled={off} onClick={() => setConfirmReset(true)}>Reset to original</button>
        )}
      </div>
      {busy ? <p role="status" className="text-sm text-muted">Loading the dataset, this can take up to a minute.</p> : null}
      <Note msg={msg} />
      {report ? <ReportView r={report} /> : null}
    </div>
  );
}

function OppEditor({ o, stages, disabled, onSaved }: { o: OppRow; stages: string[]; disabled: boolean; onSaved: (m: Msg) => void }) {
  const router = useRouter();
  const [stage, setStage] = useState(o.stage);
  const [proposed, setProposed] = useState(String(o.proposedInr));
  const [signed, setSigned] = useState(String(o.signedInr));
  const [busy, setBusy] = useState(false);
  async function save() {
    const body: Record<string, unknown> = { action: "deal", id: o.id };
    if (stage !== o.stage) body.stage = stage;
    if (Number(proposed) !== o.proposedInr) body.proposedInr = Number(proposed);
    if (Number(signed) !== o.signedInr) body.signedInr = Number(signed);
    if (Object.keys(body).length === 2) return onSaved({ ok: false, text: "No changes to save." });
    if (!Number.isFinite(Number(proposed)) || !Number.isFinite(Number(signed)) || Number(proposed) < 0 || Number(signed) < 0) return onSaved({ ok: false, text: "Values must be zero or more." });
    setBusy(true);
    const res = await fetch("/api/head/settings/datalab", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { ok: boolean; error?: string } | null;
    setBusy(false);
    onSaved(json?.ok ? { ok: true, text: `${o.name} saved.` } : { ok: false, text: json?.error ?? "Request failed." });
    if (json?.ok) router.refresh();
  }
  const off = disabled || busy;
  return (
    <tr className="border-b border-border/60">
      <th scope="row" className="px-3 py-2 text-left font-normal">{o.name}<span className="ml-2 text-xs text-muted">{o.supportType}</span></th>
      <td className="px-3 py-2">
        <select aria-label={`Stage for ${o.name}`} className={INPUT} value={stage} disabled={off} onChange={(e) => setStage(e.target.value)}>
          {stages.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td className="px-3 py-2"><input aria-label={`Proposed value for ${o.name}`} className={INPUT} inputMode="numeric" value={proposed} disabled={off} onChange={(e) => setProposed(e.target.value)} /></td>
      <td className="px-3 py-2"><input aria-label={`Signed value for ${o.name}`} className={INPUT} inputMode="numeric" value={signed} disabled={off} onChange={(e) => setSigned(e.target.value)} /></td>
      <td className="px-3 py-2 text-right"><button type="button" className={BTN} disabled={off} onClick={() => void save()}>Save</button></td>
    </tr>
  );
}

function QualEditor({ data, disabled }: { data: DataLabData; disabled: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const shown = data.qual.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 25);
  async function set(brandId: string, name: string, status: string) {
    setBusy(brandId);
    setMsg(null);
    const res = await fetch("/api/head/settings/datalab", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "qual", brandId, status }) }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { ok: boolean; error?: string } | null;
    setBusy(null);
    setMsg(json?.ok ? { ok: true, text: `${name} set to ${status}.` } : { ok: false, text: json?.error ?? "Request failed." });
    if (json?.ok) router.refresh();
  }
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="q-search" className="text-xs text-muted">Search brands (first 25 matches shown)</label>
        <input id="q-search" className={`${INPUT} max-w-xs`} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Note msg={msg} />
      <ul className="divide-y divide-border/60 rounded-[16px] border border-border">
        {shown.map((r) => (
          <li key={r.brandId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <span>{r.name}</span>
            <select aria-label={`Qualification for ${r.name}`} className={`${INPUT} w-48`} value={r.status} disabled={disabled || busy === r.brandId} onChange={(e) => void set(r.brandId, r.name, e.target.value)}>
              {[...new Set([r.status, ...data.qualStatuses])].map((s) => <option key={s} value={s} disabled={s === "none"}>{s}</option>)}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DataLab({ data, anchors, locked }: { data: DataLabData; anchors: string | null; locked: boolean }) {
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <div className="space-y-6">
      <section className="rounded-[16px] border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Upload or reset the working copy</h2>
        {locked ? <p className="text-sm text-approx">Locked dataset: read-only.</p> : <LoadPanel />}
      </section>

      <section className="rounded-[16px] border border-border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Opportunities</h2>
        <p className="mb-3 text-xs text-muted">Changing the stage sets the stage-changed time to now. A signed value is split into cash or in-kind by the opportunity type.</p>
        <Note msg={msg} />
        <div className="mt-2 max-h-[28rem] overflow-auto rounded-[16px] border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="px-3 py-3 text-left font-medium">Opportunity</th>
                <th scope="col" className="px-3 py-3 text-left font-medium">Stage</th>
                <th scope="col" className="px-3 py-3 text-left font-medium">Proposed</th>
                <th scope="col" className="px-3 py-3 text-left font-medium">Signed</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.opportunities.map((o) => (
                <OppEditor key={`${o.id}-${o.stage}-${o.proposedInr}-${o.signedInr}`} o={o} stages={data.stages} disabled={locked} onSaved={setMsg} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted tabular-nums">Current total signed in rows shown: {formatInr(data.opportunities.reduce((t, o) => t + o.signedInr, 0))}.</p>
      </section>

      <section className="rounded-[16px] border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Qualification status</h2>
        <QualEditor data={data} disabled={locked} />
      </section>

      <section className="rounded-[16px] border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Slide 1 anchors (from npm run verify)</h2>
        {anchors ? (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs text-muted">{anchors}</pre>
        ) : (
          <p className="text-sm text-muted">docs\slide1-anchors.md not found. Run npm run verify to create it.</p>
        )}
      </section>
    </div>
  );
}