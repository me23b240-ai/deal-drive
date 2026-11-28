"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FestRow, PeerBoard } from "@/lib/db/queries/head-a-peerfests";
import { daysBetween } from "@/lib/domain/bizdays";
import { PLAN_END, PLAN_START } from "@/lib/model/derive";
import { MIN_SCORE_N, SAARANG_END, SAARANG_START, type Score } from "@/lib/model/peerfest";

const INPUT = "h-9 w-full rounded-lg border border-border bg-background px-2 text-sm disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
const BTN = "min-h-9 rounded-lg border border-border px-3 text-xs hover:bg-border/40 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
const BTN1 = "min-h-11 rounded-[16px] bg-accent px-4 text-sm font-medium text-background disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const SIM = "rounded-full border border-approx/40 px-2 py-0.5 text-xs text-approx";

type Msg = { ok: boolean; text: string } | null;
type Json = { ok: boolean; error?: string; data?: { duplicate?: boolean } };

async function call(body: Record<string, unknown>): Promise<Json> {
  const res = await fetch("/api/head/peer-fests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  return ((await res?.json().catch(() => null)) as Json | null) ?? { ok: false, error: "Request failed." };
}

function Note({ msg }: { msg: Msg }) {
  return msg ? <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p> : null;
}

function Timing({ t }: { t: FestRow["timing"] }) {
  if (!t) return <span className="text-xs text-muted">no dates</span>;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${t === "before" ? "text-accent" : "text-prospective"}`}>
      <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${t === "before" ? "bg-accent" : "bg-prospective"}`} />
      {t === "before" ? "Before Saarang" : "After Saarang"}
    </span>
  );
}

function Timeline({ fests }: { fests: FestRow[] }) {
  const dated = fests.filter((f) => f.startsOn);
  const points = [SAARANG_START, SAARANG_END, PLAN_START, PLAN_END, ...dated.flatMap((f) => [f.startsOn as string, f.endsOn ?? (f.startsOn as string)])].sort();
  const min = points[0] as string;
  const max = points[points.length - 1] as string;
  const span = daysBetween(min, max) + 1;
  const pos = (d: string): number => (daysBetween(min, d) / span) * 100;
  const width = (a: string, b: string): number => Math.max(1.2, ((daysBetween(a, b) + 1) / span) * 100);
  const bands = (
    <>
      <div aria-hidden className="absolute inset-y-0 bg-border/30" style={{ left: `${pos(PLAN_START)}%`, width: `${width(PLAN_START, PLAN_END)}%` }} />
      <div aria-hidden className="absolute inset-y-0 bg-approx/25" style={{ left: `${pos(SAARANG_START)}%`, width: `${width(SAARANG_START, SAARANG_END)}%` }} />
    </>
  );
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Shaded grey: plan window ({PLAN_START} to {PLAN_END}). Shaded amber: Saarang ({SAARANG_START} to {SAARANG_END}).
      </p>
      <ul aria-label="Peer fest dates against Saarang" className="space-y-1">
        {dated.map((f) => (
          <li key={f.id} className="flex items-center gap-3">
            <span className="w-48 shrink-0 truncate text-xs" title={f.name}>{f.name}</span>
            <div className="relative h-5 flex-1 overflow-hidden rounded bg-background">
              {bands}
              <div
                className={`absolute inset-y-1 rounded ${f.timing === "before" ? "bg-accent" : "bg-prospective"}`}
                style={{ left: `${pos(f.startsOn as string)}%`, width: `${width(f.startsOn as string, f.endsOn ?? (f.startsOn as string))}%` }}
              />
            </div>
            <span className="sr-only">{f.startsOn} to {f.endsOn ?? f.startsOn}, {f.timing}</span>
          </li>
        ))}
      </ul>
      <p className="flex justify-between text-xs text-muted tabular-nums"><span>{min}</span><span>{max}</span></p>
    </div>
  );
}

function FestForm({ fest, board, disabled, onDone, onCancel }: { fest: FestRow | null; board: PeerBoard; disabled: boolean; onDone: (m: Msg) => void; onCancel: () => void }) {
  const [f, setF] = useState({
    name: fest?.name ?? "", institution: fest?.institution ?? "", city: fest?.city ?? "", tier: fest?.tier ?? "iit",
    startsOn: fest?.startsOn ?? "", endsOn: fest?.endsOn ?? "", sponsorPageUrl: fest?.sponsorPageUrl ?? "",
    researchStatus: fest?.researchStatus ?? "todo", researcherId: fest?.researcherId ?? "", notes: fest?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));

  async function save() {
    if (!f.name.trim() || !f.institution.trim() || !f.city.trim()) return onDone({ ok: false, text: "Name, institution and city are required." });
    const payload = {
      name: f.name.trim(), institution: f.institution.trim(), city: f.city.trim(), tier: f.tier,
      startsOn: f.startsOn || null, endsOn: f.endsOn || null, sponsorPageUrl: f.sponsorPageUrl.trim() || null,
      researchStatus: f.researchStatus, researcherId: f.researcherId || null, notes: f.notes.trim() || null,
    };
    setBusy(true);
    const res = await call(fest ? { action: "update", id: fest.id, fest: payload } : { action: "create", fest: payload });
    setBusy(false);
    onDone(res.ok ? { ok: true, text: fest ? `${payload.name} saved.` : `${payload.name} added.` } : { ok: false, text: res.error ?? "Request failed." });
  }

  const off = disabled || busy;
  const field = (id: string, label: string, k: keyof typeof f, type = "text") => (
    <div>
      <label htmlFor={id} className="text-xs text-muted">{label}</label>
      <input id={id} type={type} className={INPUT} value={f[k]} disabled={off} onChange={(e) => set(k)(e.target.value)} />
    </div>
  );
  return (
    <div className="space-y-3 rounded-[16px] border border-border p-4">
      <p className="text-sm font-medium">{fest ? `Edit ${fest.name}` : "Add a peer fest"}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {field("pf-name", "Fest name", "name")}
        {field("pf-inst", "Institution", "institution")}
        {field("pf-city", "City", "city")}
        <div>
          <label htmlFor="pf-tier" className="text-xs text-muted">Tier</label>
          <select id="pf-tier" className={INPUT} value={f.tier} disabled={off} onChange={(e) => set("tier")(e.target.value)}>
            <option value="iit">IIT</option><option value="iim">IIM</option><option value="other">Other</option>
          </select>
        </div>
        {field("pf-start", "Starts on", "startsOn", "date")}
        {field("pf-end", "Ends on", "endsOn", "date")}
        {field("pf-url", "Sponsor page (https://...)", "sponsorPageUrl")}
        <div>
          <label htmlFor="pf-status" className="text-xs text-muted">Research status</label>
          <select id="pf-status" className={INPUT} value={f.researchStatus} disabled={off} onChange={(e) => set("researchStatus")(e.target.value)}>
            <option value="todo">todo</option><option value="researching">researching</option><option value="done">done</option>
          </select>
        </div>
        <div>
          <label htmlFor="pf-res" className="text-xs text-muted">Researcher</label>
          <select id="pf-res" className={INPUT} value={f.researcherId} disabled={off} onChange={(e) => set("researcherId")(e.target.value)}>
            <option value="">Unassigned</option>
            {board.researchers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">{field("pf-notes", "Notes", "notes")}</div>
      </div>
      <div className="flex gap-2">
        <button type="button" className={BTN1} disabled={off} onClick={() => void save()}>Save</button>
        <button type="button" className={BTN} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function SponsorDrawer({ fest, disabled, onClose, onDone }: { fest: FestRow; disabled: boolean; onClose: () => void; onDone: (m: Msg) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function lead(id: string, name: string) {
    setBusy(id);
    const res = await call({ action: "lead", sponsorId: id });
    setBusy(null);
    if (!res.ok) return onDone({ ok: false, text: res.error ?? "Request failed." });
    onDone({ ok: true, text: res.data?.duplicate ? `${name} already exists as a company or lead, marked duplicate.` : `${name} added to Lead intake.` });
  }
  return (
    <aside role="dialog" aria-label={`Sponsors of ${fest.name}`} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }} className="fixed inset-y-0 right-0 z-30 w-full max-w-md overflow-y-auto border-l border-border bg-card p-5 shadow-xl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{fest.name}</h2>
          <p className="text-xs text-muted">{fest.sponsors.length} sponsors listed</p>
        </div>
        <button type="button" autoFocus className={BTN} onClick={onClose}>Close</button>
      </div>
      {fest.sponsors.length === 0 ? <p className="text-sm text-muted">No sponsors listed yet.</p> : null}
      <ul className="space-y-3">
        {fest.sponsors.map((s) => (
          <li key={s.id} className="rounded-[16px] border border-border p-3 text-sm">
            <p className="flex flex-wrap items-center gap-2 font-medium">{s.brandName}{s.isSimulated ? <span className={SIM}>SIM</span> : null}</p>
            <p className="text-xs text-muted">{[s.sector?.replace(/_/g, " "), s.sponsorTier, s.year].filter(Boolean).join(", ")}</p>
            {s.evidenceNote ? <p className="mt-1 text-xs text-muted">{s.evidenceNote}</p> : null}
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs">{s.status}</span>
              <button type="button" className={BTN} disabled={disabled || s.status !== "new" || busy === s.id} onClick={() => void lead(s.id, s.brandName)}>Make lead</button>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

const pct = (x: number | null): string => (x === null ? "-" : `${Math.round(x * 1000) / 10}%`);

function ScoreCells({ s }: { s: Score }) {
  return (
    <>
      <td className="px-3 py-2 text-right tabular-nums">{s.n}</td>
      <td className="px-3 py-2 text-right tabular-nums">{pct(s.responseRate)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{pct(s.proposalRate)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{pct(s.signRate)}</td>
      <td className="px-3 py-2">
        {s.insufficient ? (
          <span className="inline-flex items-center gap-1 text-xs text-approx"><span aria-hidden className="inline-block h-2 w-2 rounded-full bg-approx" />insufficient data (n under {MIN_SCORE_N})</span>
        ) : (
          <span className="text-xs text-success">enough data</span>
        )}
      </td>
    </>
  );
}

export function PeerFestBoard({ board, locked }: { board: PeerBoard; locked: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [editing, setEditing] = useState<FestRow | "new" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const open = board.fests.find((f) => f.id === openId) ?? null;
  const off = locked || pending;

  function done(m: Msg) {
    setMsg(m);
    if (m?.ok) {
      setEditing(null);
      startTransition(() => router.refresh());
    }
  }
  async function quick(id: string, fest: Record<string, unknown>) {
    setBusy(id);
    const res = await call({ action: "update", id, fest });
    setBusy(null);
    done(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error ?? "Request failed." });
  }

  const before = board.fests.filter((f) => f.timing === "before").length;
  const after = board.fests.filter((f) => f.timing === "after").length;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted tabular-nums">
        {board.fests.length} peer fests ({before} before Saarang, {after} after). Research done on {board.fests.filter((f) => f.researchStatus === "done").length}.
      </p>
      <Note msg={msg} />

      <section className="rounded-[16px] border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Timeline against Saarang</h2>
        {board.fests.some((f) => f.startsOn) ? <Timeline fests={board.fests} /> : <p className="text-sm text-muted">No fest has dates yet.</p>}
      </section>

      <section className="space-y-3 rounded-[16px] border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Peer fests</h2>
          <button type="button" className={BTN} disabled={off} onClick={() => setEditing("new")}>Add fest</button>
        </div>
        {editing ? (
          <FestForm key={editing === "new" ? "new" : editing.id} fest={editing === "new" ? null : editing} board={board} disabled={off} onDone={done} onCancel={() => setEditing(null)} />
        ) : null}
        {board.fests.length === 0 ? (
          <p className="rounded-[16px] border border-dashed border-border p-6 text-sm text-muted">No peer fests yet. Add one, or run npm run seed:peerfests for the simulated set.</p>
        ) : (
          <div className="overflow-x-auto rounded-[16px] border border-border">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="px-3 py-3 text-left font-medium">Fest</th>
                  <th scope="col" className="px-3 py-3 text-left font-medium">Dates</th>
                  <th scope="col" className="px-3 py-3 text-left font-medium">Research</th>
                  <th scope="col" className="px-3 py-3 text-left font-medium">Researcher</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Sponsors found</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Leads created</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Updated</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {board.fests.map((f) => (
                  <tr key={f.id} className="border-b border-border/60">
                    <th scope="row" className="px-3 py-2 text-left font-medium">
                      <span className="flex flex-wrap items-center gap-2">{f.name}<span className={SIM}>SIM</span></span>
                      <span className="block text-xs font-normal text-muted">{f.institution}, {f.city}, {f.tier.toUpperCase()}</span>
                    </th>
                    <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums">
                      {f.startsOn ? `${f.startsOn} to ${f.endsOn ?? f.startsOn}` : "-"}
                      <span className="block"><Timing t={f.timing} /></span>
                    </td>
                    <td className="px-3 py-2">
                      <select aria-label={`Research status for ${f.name}`} className={INPUT} value={f.researchStatus} disabled={off || busy === f.id} onChange={(e) => void quick(f.id, { researchStatus: e.target.value })}>
                        <option value="todo">todo</option><option value="researching">researching</option><option value="done">done</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select aria-label={`Researcher for ${f.name}`} className={INPUT} value={f.researcherId ?? ""} disabled={off || busy === f.id} onChange={(e) => void quick(f.id, { researcherId: e.target.value || null })}>
                        <option value="">Unassigned</option>
                        {board.researchers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.sponsorsFound}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.leadsCreated}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-muted tabular-nums">{f.updatedAt ? f.updatedAt.slice(0, 10) : "-"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <button type="button" className={BTN} onClick={() => setOpenId(f.id)}>Sponsors</button>{" "}
                      <button type="button" className={BTN} disabled={off} onClick={() => setEditing(f)}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {locked ? <p className="text-xs text-approx">Locked dataset: read-only.</p> : null}
      </section>

      <section className="rounded-[16px] border border-border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Source scorecard</h2>
        <p className="mb-3 text-xs text-muted">Response = responded / outreached, proposal = reached Prospective / responded, sign = converted / proposals. Under {MIN_SCORE_N} outreached the rates are only directional.</p>
        <div className="overflow-x-auto rounded-[16px] border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="px-3 py-3 text-left font-medium">Source</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">n outreached</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Response</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Proposal</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Sign</th>
                <th scope="col" className="px-3 py-3 text-left font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {board.scorecard.byTiming.map((r) => (
                <tr key={r.timing} className="border-b border-border/60 bg-border/20 font-medium">
                  <th scope="row" className="px-3 py-2 text-left">{r.timing === "before" ? "All fests before Saarang" : "All fests after Saarang"}</th>
                  <ScoreCells s={r.score} />
                </tr>
              ))}
              {board.scorecard.byFest.map((r) => (
                <tr key={r.festId} className="border-b border-border/60">
                  <th scope="row" className="px-3 py-2 text-left font-normal">{r.name}</th>
                  <ScoreCells s={r.score} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {open ? <SponsorDrawer fest={open} disabled={off} onClose={() => setOpenId(null)} onDone={done} /> : null}
    </div>
  );
}