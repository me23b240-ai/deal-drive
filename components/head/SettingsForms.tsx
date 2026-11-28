"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SettingsData } from "@/lib/db/queries/head-b-settings";

const LABELS = ["normal", "sprint", "off"];
const INPUT = "h-10 w-full rounded-lg border border-border bg-background px-2 text-sm tabular-nums disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
const BTN = "min-h-11 rounded-[16px] bg-accent px-4 text-sm font-medium text-background disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BTN2 = "min-h-9 rounded-lg border border-border px-3 text-xs hover:bg-border/40 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

type Msg = { ok: boolean; text: string } | null;

function useSection(locked: boolean) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function send(body: Record<string, unknown>, okText: string): Promise<boolean> {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/head/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { ok: boolean; error?: string } | null;
    setBusy(false);
    if (json?.ok) {
      setMsg({ ok: true, text: okText });
      startTransition(() => router.refresh());
      return true;
    }
    setMsg({ ok: false, text: json?.error ?? "Request failed." });
    return false;
  }
  return { disabled: locked || busy || pending, msg, send, fail: (text: string) => setMsg({ ok: false, text }) };
}

function Note({ msg, locked }: { msg: Msg; locked: boolean }) {
  return (
    <>
      {msg ? <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p> : null}
      {locked ? <p className="text-xs text-approx">Locked dataset: read-only.</p> : null}
    </>
  );
}

function Field(props: { id: string; label: string; value: string; onChange: (v: string) => void; disabled: boolean; type?: string }) {
  return (
    <div>
      <label htmlFor={props.id} className="text-xs text-muted">{props.label}</label>
      <input id={props.id} type={props.type ?? "text"} inputMode={props.type === "date" ? undefined : "decimal"} className={INPUT} value={props.value} disabled={props.disabled} onChange={(e) => props.onChange(e.target.value)} />
    </div>
  );
}

const isNum = (s: string): boolean => s.trim() !== "" && Number.isFinite(Number(s));

export function TargetsForm({ data, locked }: { data: SettingsData; locked: boolean }) {
  const s = useSection(locked);
  const [rows, setRows] = useState(data.targets.map((t) => ({ ...t, target: String(t.target) })));
  const [bulk, setBulk] = useState(String(data.defaultTarget));
  const [bulkLabel, setBulkLabel] = useState("normal");
  const patch = (id: string, p: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x) => (x.memberId === id ? { ...x, ...p } : x)));
  async function save() {
    if (rows.some((r) => !isNum(r.target) || Number(r.target) < 0)) return s.fail("Every target must be a number, zero or more.");
    await s.send({ section: "targets", weekStart: data.weekStart, items: rows.map((r) => ({ memberId: r.memberId, target: Math.round(Number(r.target)), label: r.label })) }, `Targets saved for the week of ${data.weekStart}.`);
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">Week of {data.weekStart}. Target = companies first outreached that week. Label sprint or off is a note for the team.</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-28"><Field id="bulk-target" label="Apply to all" value={bulk} onChange={setBulk} disabled={s.disabled} /></div>
        <div>
          <label htmlFor="bulk-label" className="text-xs text-muted">Label</label>
          <select id="bulk-label" className={INPUT} value={bulkLabel} disabled={s.disabled} onChange={(e) => setBulkLabel(e.target.value)}>
            {LABELS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>
        <button type="button" className={BTN2} disabled={s.disabled} onClick={() => setRows((r) => r.map((x) => ({ ...x, target: bulk, label: bulkLabel })))}>Apply</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <div key={r.memberId} className="flex items-end gap-2 rounded-[16px] border border-border p-3">
            <div className="flex-1"><Field id={`t-${r.memberId}`} label={r.name} value={r.target} onChange={(v) => patch(r.memberId, { target: v })} disabled={s.disabled} /></div>
            <select aria-label={`Label for ${r.name}`} className={`${INPUT} w-24`} value={r.label} disabled={s.disabled} onChange={(e) => patch(r.memberId, { label: e.target.value })}>
              {[...new Set([r.label, ...LABELS])].map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
        ))}
      </div>
      <button type="button" className={BTN} disabled={s.disabled} onClick={() => void save()}>Save targets</button>
      <Note msg={s.msg} locked={locked} />
    </div>
  );
}

export function GoalForm({ scenario, signed, cash, locked }: { scenario: "base" | "stretch"; signed: number | null; cash: number | null; locked: boolean }) {
  const s = useSection(locked);
  const [sg, setSg] = useState(signed === null ? "" : String(signed));
  const [ca, setCa] = useState(cash === null ? "" : String(cash));
  async function save() {
    for (const v of [sg, ca]) if (v.trim() !== "" && (!isNum(v) || Number(v) < 0)) return s.fail("Targets must be numbers, zero or more.");
    await s.send({ section: "goals", scenario, signed: sg.trim() === "" ? null : Math.round(Number(sg)), cash: ca.trim() === "" ? null : Math.round(Number(ca)) }, `${scenario} target saved.`);
  }
  return (
    <div className="space-y-3 rounded-[16px] border border-border p-4">
      <p className="text-sm font-medium capitalize">{scenario} target (rupees)</p>
      <Field id={`g-${scenario}-s`} label="Signed value goal" value={sg} onChange={setSg} disabled={s.disabled} />
      <Field id={`g-${scenario}-c`} label="Cash collected goal" value={ca} onChange={setCa} disabled={s.disabled} />
      <button type="button" className={BTN} disabled={s.disabled} onClick={() => void save()}>Save</button>
      <Note msg={s.msg} locked={locked} />
    </div>
  );
}

const SEG: [string, string][] = [
  ["warm.response", "Warm response"], ["warm.proposalRate", "Warm proposal rate"], ["warm.signRate", "Warm sign rate"],
  ["other.response", "Other response"], ["other.proposalRate", "Other proposal rate"], ["other.signRate", "Other sign rate"],
];
const pct = (x: number): string => String(Math.round(x * 10000) / 100);
const read = (o: SettingsData["plan"]["base"], path: string): number => {
  const [a, b] = path.split(".") as ["warm" | "other", "response" | "proposalRate" | "signRate"];
  return o[a][b];
};

export function PlanForm({ data, locked }: { data: SettingsData; locked: boolean }) {
  const s = useSection(locked);
  const p = data.plan;
  const [v, setV] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {
      avgNewDeal: String(p.avgNewDeal), prefestShare: pct(p.prefestShare), inkindScope: p.inkindScope,
      stretchWarmLeads: String(p.stretchWarmLeads), stretchOtherLeads: String(p.stretchOtherLeads), warmNetwork: String(p.warmSplit.network), warmReferral: String(p.warmSplit.referral), baselineAvgDeal: String(p.baselineAvgDeal),
    };
    for (const sc of ["base", "stretch"] as const) {
      out[`${sc}.closeRate`] = pct(p[sc].closeRate);
      out[`${sc}.inkindShare`] = pct(p[sc].inkindShare);
      for (const [path] of SEG) out[`${sc}.${path}`] = pct(read(p[sc], path));
    }
    return out;
  });
  const set = (k: string) => (x: string) => setV((o) => ({ ...o, [k]: x }));
  async function save() {
    const keys = Object.keys(v).filter((k) => k !== "inkindScope");
    if (keys.some((k) => !isNum(v[k] ?? ""))) return s.fail("Every field must be a number.");
    const r = (k: string): number => Number(v[k]) / 100;
    if (keys.filter((k) => k.includes(".") || k === "prefestShare").some((k) => r(k) < 0 || r(k) > 1)) return s.fail("Percentages must be between 0 and 100.");
    const seg = (sc: string, g: string) => ({ response: r(`${sc}.${g}.response`), proposalRate: r(`${sc}.${g}.proposalRate`), signRate: r(`${sc}.${g}.signRate`) });
    const scen = (sc: string) => ({ closeRate: r(`${sc}.closeRate`), inkindShare: r(`${sc}.inkindShare`), warm: seg(sc, "warm"), other: seg(sc, "other") });
    await s.send({
      section: "plan",
      plan: {
        avgNewDeal: Number(v.avgNewDeal), prefestShare: r("prefestShare"), inkindScope: v.inkindScope,
        stretchWarmLeads: Math.round(Number(v.stretchWarmLeads)), stretchOtherLeads: Math.round(Number(v.stretchOtherLeads)), warmSplit: { network: Math.round(Number(v.warmNetwork)), referral: Math.round(Number(v.warmReferral)) }, baselineAvgDeal: Number(v.baselineAvgDeal),
        base: scen("base"), stretch: scen("stretch"),
      },
    }, "Plan assumptions saved. Plan, Overview and the chatbot now use them.");
  }
  return (
    <div className="space-y-5">
      <p className="text-xs text-muted">All rates are ASSUMED and entered as percentages.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="p-avg" label="Average new deal (rupees)" value={v.avgNewDeal ?? ""} onChange={set("avgNewDeal")} disabled={s.disabled} />
        <Field id="p-pre" label="Pre-fest share (%)" value={v.prefestShare ?? ""} onChange={set("prefestShare")} disabled={s.disabled} />
        <div>
          <label htmlFor="p-scope" className="text-xs text-muted">In-kind policy scope</label>
          <select id="p-scope" className={INPUT} value={v.inkindScope} disabled={s.disabled} onChange={(e) => set("inkindScope")(e.target.value)}>
            <option value="all">all (reproduces the slides)</option>
            <option value="new_only">new_only (existing keeps observed in-kind)</option>
          </select>
        </div>
        <Field id="p-wl" label="Stretch warm leads (total, incl. queue)" value={v.stretchWarmLeads ?? ""} onChange={set("stretchWarmLeads")} disabled={s.disabled} />
        <Field id="p-ol" label="Stretch other leads" value={v.stretchOtherLeads ?? ""} onChange={set("stretchOtherLeads")} disabled={s.disabled} />
        <Field id="p-wn" label="Warm network leads (bet-2)" value={v.warmNetwork ?? ""} onChange={set("warmNetwork")} disabled={s.disabled} /><Field id="p-wr" label="Warm referral leads (bet-4)" value={v.warmReferral ?? ""} onChange={set("warmReferral")} disabled={s.disabled} /><Field id="p-bl" label="Baseline average deal (rupees)" value={v.baselineAvgDeal ?? ""} onChange={set("baselineAvgDeal")} disabled={s.disabled} />
      </div>
      {(["base", "stretch"] as const).map((sc) => (
        <fieldset key={sc} className="rounded-[16px] border border-border p-4">
          <legend className="px-2 text-sm font-medium capitalize">{sc} scenario (%)</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id={`${sc}-cr`} label="Close rate on open prospects" value={v[`${sc}.closeRate`] ?? ""} onChange={set(`${sc}.closeRate`)} disabled={s.disabled} />
            <Field id={`${sc}-ik`} label="In-kind share" value={v[`${sc}.inkindShare`] ?? ""} onChange={set(`${sc}.inkindShare`)} disabled={s.disabled} />
            {SEG.map(([path, label]) => (
              <Field key={path} id={`${sc}-${path}`} label={label} value={v[`${sc}.${path}`] ?? ""} onChange={set(`${sc}.${path}`)} disabled={s.disabled} />
            ))}
          </div>
        </fieldset>
      ))}
      <button type="button" className={BTN} disabled={s.disabled} onClick={() => void save()}>Save plan assumptions</button>
      <Note msg={s.msg} locked={locked} />
    </div>
  );
}

export function DatesForm({ data, locked }: { data: SettingsData; locked: boolean }) {
  const s = useSection(locked);
  const d = data.dates;
  const [bs, setBs] = useState(d.bundleStart);
  const [be, setBe] = useState(d.bundleStop);
  const [pre, setPre] = useState(d.prefestDue);
  const [post, setPost] = useState(d.postfestDue);
  const [obs, setObs] = useState(d.useObserved);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field id="d-bs" type="date" label="Bundle discount start" value={bs} onChange={setBs} disabled={s.disabled} />
        <Field id="d-be" type="date" label="Bundle discount stop" value={be} onChange={setBe} disabled={s.disabled} />
        <Field id="d-pre" type="date" label="Pre-fest payment due" value={pre} onChange={setPre} disabled={s.disabled} />
        <Field id="d-post" type="date" label="Post-fest payment due" value={post} onChange={setPost} disabled={s.disabled} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={obs} disabled={s.disabled} onChange={(e) => setObs(e.target.checked)} className="h-4 w-4 accent-[#2dd4bf]" />
        Use observed rates where n is at least 30 outreached
      </label>
      <p className="text-xs text-approx">Saved as settings. New payment rows and the Plan tab do not read the due dates or this toggle yet (foundation change pending).</p>
      <button type="button" className={BTN} disabled={s.disabled} onClick={() => void s.send({ section: "dates", bundleStart: bs, bundleStop: be, prefestDue: pre, postfestDue: post, useObserved: obs }, "Dates saved.")}>Save dates</button>
      <Note msg={s.msg} locked={locked} />
    </div>
  );
}

export function StaleForm({ data, locked }: { data: SettingsData; locked: boolean }) {
  const s = useSection(locked);
  const [rows, setRows] = useState(data.staleRules.map((r) => ({ key: r.state_key, days: String(r.days_threshold) })));
  async function save() {
    if (rows.some((r) => !isNum(r.days) || Number(r.days) < 0)) return s.fail("Thresholds must be zero or more.");
    await s.send({ section: "stale", items: rows.map((r) => ({ stateKey: r.key, days: Math.round(Number(r.days)) })) }, "Stale rules saved. Needs-update lists use them now.");
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">Business days of silence before a company needs an update.</p>
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {rows.map((r) => (
          <Field key={r.key} id={`st-${r.key}`} label={r.key} value={r.days} onChange={(x) => setRows((o) => o.map((y) => (y.key === r.key ? { ...y, days: x } : y)))} disabled={s.disabled} />
        ))}
      </div>
      <button type="button" className={BTN} disabled={s.disabled} onClick={() => void save()}>Save stale rules</button>
      <Note msg={s.msg} locked={locked} />
    </div>
  );
}

export function HolidaysForm({ data, locked }: { data: SettingsData; locked: boolean }) {
  const s = useSection(locked);
  const [day, setDay] = useState("");
  const [name, setName] = useState("");
  return (
    <div className="space-y-4">
      <ul className="flex flex-wrap gap-2">
        {data.holidays.length === 0 ? <li className="text-sm text-muted">No holidays set.</li> : null}
        {data.holidays.map((h) => (
          <li key={h} className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm tabular-nums">
            {h}
            <button type="button" aria-label={`Remove holiday ${h}`} className="text-xs text-danger disabled:opacity-50" disabled={s.disabled} onClick={() => void s.send({ section: "holiday", op: "remove", day: h }, `Removed ${h}.`)}>Remove</button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <Field id="h-day" type="date" label="Date" value={day} onChange={setDay} disabled={s.disabled} />
        <Field id="h-name" label="Name" value={name} onChange={setName} disabled={s.disabled} />
        <button type="button" className={BTN2} disabled={s.disabled || !day} onClick={() => void s.send({ section: "holiday", op: "add", day, name }, `Added ${day}.`).then((ok) => { if (ok) { setDay(""); setName(""); } })}>Add holiday</button>
      </div>
      <Note msg={s.msg} locked={locked} />
    </div>
  );
}

function RuleEditor({ rule, locked }: { rule: SettingsData["rules"][number]; locked: boolean }) {
  const s = useSection(locked);
  const fmt = (x: unknown): string => (x === null || x === undefined ? "" : JSON.stringify(x, null, 2));
  const [t, setT] = useState({ scale: fmt(rule.scale), change: fmt(rule.change), stop: fmt(rule.stop) });
  async function save() {
    const out: Record<string, unknown> = {};
    for (const k of ["scale", "change", "stop"] as const) {
      const text = t[k].trim();
      if (!text) { out[k] = null; continue; }
      try { out[k] = JSON.parse(text); } catch { return s.fail(`${k} rule is not valid JSON.`); }
    }
    await s.send({ section: "rules", campaignId: rule.campaignId, ...out }, `${rule.code} rules saved. Badges use them now.`);
  }
  return (
    <div className="space-y-3 rounded-[16px] border border-border p-4">
      <p className="text-sm font-medium">{rule.code}: {rule.name}</p>
      <div className="grid gap-3 lg:grid-cols-3">
        {(["scale", "change", "stop"] as const).map((k) => (
          <div key={k}>
            <label htmlFor={`r-${rule.code}-${k}`} className="text-xs uppercase text-muted">{k} rule (empty = none)</label>
            <textarea id={`r-${rule.code}-${k}`} rows={7} spellCheck={false} value={t[k]} disabled={s.disabled} onChange={(e) => setT((o) => ({ ...o, [k]: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background p-2 font-mono text-xs disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" />
          </div>
        ))}
      </div>
      <button type="button" className={BTN} disabled={s.disabled} onClick={() => void save()}>Save rules</button>
      <Note msg={s.msg} locked={locked} />
    </div>
  );
}

export function RulesForm({ data, locked }: { data: SettingsData; locked: boolean }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">Format: {"{\"all\":[{\"m\":\"response_rate\",\"op\":\">=\",\"v\":0.5}]}"}. Unknown metrics or operators are rejected on save.</p>
      {data.rules.map((r) => <RuleEditor key={r.campaignId} rule={r} locked={locked} />)}
    </div>
  );
}