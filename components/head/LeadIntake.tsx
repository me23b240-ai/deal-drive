"use client";

import Papa from "papaparse";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { LeadsBoard } from "@/lib/db/queries/head-a-leads";
import { QUEUE_SOFT_CAP } from "@/lib/db/queries/head-a-leads";
import { LEAD_CHANNELS, LEAD_CHANNEL_LABELS, channelToInitiative, type LeadChannel } from "@/lib/domain/channels";
import { SIGNAL_LABELS, SIGNAL_TAGS, isSignalTag } from "@/lib/domain/signals";
import { normName } from "@/lib/model/derive";

const INPUT = "h-9 rounded-lg border border-border bg-background px-2 text-sm disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
const BTN = "min-h-9 rounded-lg border border-border px-3 text-xs hover:bg-border/40 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
const BTN1 = "min-h-11 rounded-[16px] bg-accent px-4 text-sm font-medium text-background disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const MAX_ROWS = 500;

const BET_NAMES: Record<string, string> = {
  "bet-1": "bet-1 Deal desk",
  "bet-2": "bet-2 Warm network",
  "bet-3": "bet-3 Offer design",
  "bet-4": "bet-4 Referral magnet",
  "bet-5": "bet-5 Lead engine",
};

const FIELDS = [
  { key: "name", label: "Company", alias: ["company", "company name", "brand", "brand name", "name", "organisation", "organization"] },
  { key: "sector", label: "Sector", alias: ["sector", "industry"] },
  { key: "contactName", label: "Contact name", alias: ["contact", "contact name", "poc", "person"] },
  { key: "contactEmail", label: "Contact email", alias: ["email", "contact email", "e-mail"] },
  { key: "contactTitle", label: "Contact title", alias: ["title", "designation", "job title", "role"] },
  { key: "channel", label: "Channel (optional)", alias: ["channel", "source", "source channel"] },
  { key: "signal", label: "Signal (optional)", alias: ["signal", "signal tag", "tag"] },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];

type Msg = { ok: boolean; text: string } | null;
type Over = { channel?: string; signal?: string };

function Note({ msg }: { msg: Msg }) {
  return msg ? <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p> : null;
}

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; data?: Record<string, number | string> }> {
  const res = await fetch("/api/head/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  return ((await res?.json().catch(() => null)) as { ok: boolean; error?: string; data?: Record<string, number | string> } | null) ?? { ok: false, error: "Request failed." };
}

function ImportPanel({ board, locked }: { board: LeadsBoard; locked: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<Record<string, string>[]>([]);
  const [map, setMap] = useState<Partial<Record<FieldKey, string>>>({});
  const [defChannel, setDefChannel] = useState<string>("cold_database");
  const [defSignal, setDefSignal] = useState("");
  const [over, setOver] = useState<Record<number, Over>>({});

  function onFile(file: File | undefined) {
    setMsg(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) return setMsg({ ok: false, text: "Choose a .csv file." });
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const hs = res.meta.fields ?? [];
        if (res.data.length > MAX_ROWS) return setMsg({ ok: false, text: `The file has ${res.data.length} rows. The limit is ${MAX_ROWS}.` });
        const m: Partial<Record<FieldKey, string>> = {};
        for (const f of FIELDS) {
          const hit = hs.find((h) => (f.alias as readonly string[]).includes(h.trim().toLowerCase()));
          if (hit) m[f.key] = hit;
        }
        setFileName(file.name);
        setHeaders(hs);
        setData(res.data);
        setMap(m);
        setOver({});
      },
      error: (e) => setMsg({ ok: false, text: e.message }),
    });
  }

  const rows = useMemo(() => {
    const seen = new Set(board.existingNames);
    const get = (r: Record<string, string>, k: FieldKey): string => (map[k] ? String(r[map[k] as string] ?? "").trim() : "");
    return data.map((r, i) => {
      const rawCh = get(r, "channel").toLowerCase().replace(/[\s/-]+/g, "_");
      const rawSig = get(r, "signal").toLowerCase().replace(/[\s/-]+/g, "_");
      const channel = over[i]?.channel ?? ((LEAD_CHANNELS as readonly string[]).includes(rawCh) ? rawCh : defChannel);
      const signal = over[i]?.signal ?? (isSignalTag(rawSig) ? rawSig : defSignal);
      const brandName = get(r, "name");
      const key = normName(brandName);
      const dup = brandName !== "" && seen.has(key);
      if (brandName) seen.add(key);
      return { i, brandName, sector: get(r, "sector"), contactName: get(r, "contactName"), contactEmail: get(r, "contactEmail"), contactTitle: get(r, "contactTitle"), channel, signal, dup, bet: channelToInitiative(channel, signal || null) };
    });
  }, [data, map, over, defChannel, defSignal, board.existingNames]);

  const valid = rows.filter((r) => r.brandName);
  const off = locked || busy || pending;

  async function send() {
    setBusy(true);
    setMsg(null);
    const res = await post({
      action: "import",
      batch: fileName,
      rows: valid.map((r) => ({ brandName: r.brandName, sector: r.sector || undefined, contactName: r.contactName || undefined, contactEmail: r.contactEmail || undefined, contactTitle: r.contactTitle || undefined, channel: r.channel, signal: r.signal || null })),
    });
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: `${res.data?.added} new leads added, ${res.data?.duplicates} duplicates kept for review, ${res.data?.invalid} invalid.` });
      setData([]);
      setHeaders([]);
      startTransition(() => router.refresh());
    } else setMsg({ ok: false, text: res.error ?? "Import failed." });
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="lead-file" className="text-xs text-muted">CSV file (up to {MAX_ROWS} rows, first row is the header)</label>
        <input id="lead-file" type="file" accept=".csv" disabled={off} onChange={(e) => onFile(e.target.files?.[0])} className="mt-1 block text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-card file:px-3 file:py-2 file:text-xs" />
      </div>
      <Note msg={msg} />
      {headers.length > 0 ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label htmlFor={`map-${f.key}`} className="text-xs text-muted">{f.label}</label>
                <select id={`map-${f.key}`} className={`${INPUT} w-full`} value={map[f.key] ?? ""} disabled={off} onChange={(e) => setMap((m) => ({ ...m, [f.key]: e.target.value }))}>
                  <option value="">(none)</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
            <div>
              <label htmlFor="def-channel" className="text-xs text-muted">Default channel</label>
              <select id="def-channel" className={`${INPUT} w-full`} value={defChannel} disabled={off} onChange={(e) => setDefChannel(e.target.value)}>
                {LEAD_CHANNELS.map((c) => <option key={c} value={c}>{LEAD_CHANNEL_LABELS[c as LeadChannel]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="def-signal" className="text-xs text-muted">Default signal</label>
              <select id="def-signal" className={`${INPUT} w-full`} value={defSignal} disabled={off} onChange={(e) => setDefSignal(e.target.value)}>
                <option value="">(none)</option>
                {SIGNAL_TAGS.map((s) => <option key={s} value={s}>{SIGNAL_LABELS[s]}</option>)}
              </select>
            </div>
          </div>
          {!map.name ? <p role="alert" className="text-sm text-danger">Map the Company column to continue.</p> : null}
          <p className="text-sm text-muted tabular-nums">{valid.length} rows, {valid.filter((r) => r.dup).length} look like duplicates of existing companies or leads.</p>
          <div className="max-h-96 overflow-auto rounded-[16px] border border-border">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="px-3 py-2 text-left font-medium">Company</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Channel</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Signal</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Bet</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Check</th>
                </tr>
              </thead>
              <tbody>
                {valid.map((r) => (
                  <tr key={r.i} className="border-b border-border/60">
                    <th scope="row" className="px-3 py-1 text-left font-normal">{r.brandName}</th>
                    <td className="px-3 py-1">
                      <select aria-label={`Channel for ${r.brandName}`} className={INPUT} value={r.channel} disabled={off} onChange={(e) => setOver((o) => ({ ...o, [r.i]: { ...o[r.i], channel: e.target.value } }))}>
                        {LEAD_CHANNELS.map((c) => <option key={c} value={c}>{LEAD_CHANNEL_LABELS[c as LeadChannel]}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1">
                      <select aria-label={`Signal for ${r.brandName}`} className={INPUT} value={r.signal} disabled={off} onChange={(e) => setOver((o) => ({ ...o, [r.i]: { ...o[r.i], signal: e.target.value } }))}>
                        <option value="">(none)</option>
                        {SIGNAL_TAGS.map((s) => <option key={s} value={s}>{SIGNAL_LABELS[s]}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1 text-xs">{BET_NAMES[r.bet] ?? r.bet}</td>
                    <td className="px-3 py-1 text-xs">
                      {r.dup ? (
                        <span className="inline-flex items-center gap-1 text-approx"><span aria-hidden className="inline-block h-2 w-2 rounded-full bg-approx" />Duplicate</span>
                      ) : r.channel === "agency" || r.signal === "agency" ? (
                        <span className="text-muted">Agency: 15% commission, net 85%</span>
                      ) : (
                        <span className="text-success">New</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className={BTN1} disabled={off || !map.name || valid.length === 0} onClick={() => void send()}>
            Import {valid.length} rows
          </button>
        </>
      ) : null}
      {locked ? <p className="text-xs text-approx">Locked dataset: read-only.</p> : null}
    </div>
  );
}

function AssignList({ board, locked }: { board: LeadsBoard; locked: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const fresh = board.candidates.filter((c) => c.status === "new" || c.status === "not_fit");
  const load = new Map(board.coordinators.map((c) => [c.id, c]));

  async function act(id: string, body: Record<string, unknown>, okText: string) {
    setBusy(id);
    setMsg(null);
    const res = await post(body);
    setBusy(null);
    if (res.ok) {
      setMsg({ ok: true, text: okText });
      startTransition(() => router.refresh());
    } else setMsg({ ok: false, text: res.error ?? "Request failed." });
  }

  if (fresh.length === 0) return <p className="rounded-[16px] border border-dashed border-border p-6 text-sm text-muted">No leads waiting. Import a CSV above.</p>;
  return (
    <div className="space-y-3">
      <Note msg={msg} />
      <div className="overflow-x-auto rounded-[16px] border border-border">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="px-3 py-2 text-left font-medium">Lead</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Channel and signal</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Bet</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Assign to</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {fresh.map((c) => {
              const owner = pick[c.id] ?? "";
              const l = load.get(owner);
              const over = !!l && l.queue >= QUEUE_SOFT_CAP;
              const off = locked || pending || busy === c.id;
              const notFit = c.status === "not_fit";
              return (
                <tr key={c.id} className={`border-b border-border/60 ${notFit ? "opacity-60" : ""}`}>
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {c.brandName}
                    <span className="block text-xs font-normal text-muted">{[c.contactName, c.contactEmail].filter(Boolean).join(", ") || "no contact"}</span>
                  </th>
                  <td className="px-3 py-2 text-xs">
                    {LEAD_CHANNEL_LABELS[c.channel as LeadChannel] ?? c.channel}
                    {c.signal && isSignalTag(c.signal) ? `, ${SIGNAL_LABELS[c.signal]}` : ""}
                    {c.commissionPct > 0 ? <span className="block text-muted">Commission {c.commissionPct}%, net {100 - c.commissionPct}%</span> : null}
                  </td>
                  <td className="px-3 py-2 text-xs">{BET_NAMES[c.bet] ?? c.bet}</td>
                  <td className="px-3 py-2">
                    <select aria-label={`Coordinator for ${c.brandName}`} className={INPUT} value={owner} disabled={off || notFit} onChange={(e) => setPick((p) => ({ ...p, [c.id]: e.target.value }))}>
                      <option value="">Choose coordinator</option>
                      {board.coordinators.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.queue} untouched)</option>)}
                    </select>
                    {over ? (
                      <span className="mt-1 flex items-center gap-1 text-xs text-approx"><span aria-hidden className="inline-block h-2 w-2 rounded-full bg-approx" />Queue at or over {QUEUE_SOFT_CAP}</span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {notFit ? (
                      <button type="button" className={BTN} disabled={off} onClick={() => void act(c.id, { action: "status", candidateId: c.id, status: "new" }, `${c.brandName} restored.`)}>Restore</button>
                    ) : (
                      <>
                        <button type="button" className={BTN} disabled={off || !owner} onClick={() => void act(c.id, { action: "assign", candidateId: c.id, ownerId: owner }, `${c.brandName} assigned to ${l?.name ?? "the coordinator"}.`)}>
                          {over ? "Assign anyway" : "Assign"}
                        </button>{" "}
                        <button type="button" className={BTN} disabled={off} onClick={() => void act(c.id, { action: "status", candidateId: c.id, status: "not_fit" }, `${c.brandName} marked not a fit.`)}>Not a fit</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function LeadIntake({ board, locked }: { board: LeadsBoard; locked: boolean }) {
  const c = board.counts;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted tabular-nums">
        Leads: {c.new ?? 0} new, {c.assigned ?? 0} assigned, {c.duplicate ?? 0} duplicates, {c.not_fit ?? 0} not a fit.
      </p>
      <section className="rounded-[16px] border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Import leads (CSV)</h2>
        <ImportPanel board={board} locked={locked} />
      </section>
      <section className="rounded-[16px] border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Assign one at a time</h2>
        <AssignList board={board} locked={locked} />
      </section>
    </div>
  );
}