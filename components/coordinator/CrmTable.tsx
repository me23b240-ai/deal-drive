"use client";

import { useState } from "react";
import { CHANNEL_LABELS, CHANNELS, type ChannelCode } from "@/lib/domain/channels";
import { STATUS_CODES, STATUS_LABELS, type StatusCode } from "@/lib/domain/status";
import { legalNextStatuses } from "@/lib/domain/crm-rules";
import { formatInr } from "@/lib/domain/money";
import { FlagDot } from "./badges";
import { bdays, fmtDay } from "./format";
import { useQueryNav } from "./nav";
import { BTN, CARD, INPUT } from "./styles";
import { StatusModal, type StatusTarget } from "./TransitionModals";
import type { CrmPage } from "./types";

const TIERS = ["large", "medium", "small"];
const SELECT = "min-h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50";

export function CrmTable({ page, locked, selectedId }: { page: CrmPage; locked: boolean; selectedId: string | null }) {
  const { sp, setParams } = useQueryNav();
  const [target, setTarget] = useState<StatusTarget | null>(null);
  const [q, setQ] = useState(sp.get("q") ?? "");
  const sort = sp.get("sort") ?? "last_update";
  const dir = sp.get("dir") ?? "desc";
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));

  function sortBy(key: string) {
    setParams({ sort: key, dir: sort === key && dir === "asc" ? "desc" : "asc", page: null });
  }
  const arrow = (key: string) => (sort === key ? (dir === "asc" ? " \u2191" : " \u2193") : "");
  const th = (key: string, text: string) => (
    <th scope="col" aria-sort={sort === key ? (dir === "asc" ? "ascending" : "descending") : "none"} className="px-3 py-2 text-left text-xs font-medium text-muted">
      <button type="button" onClick={() => sortBy(key)} className="hover:text-foreground">
        {text}
        {arrow(key)}
      </button>
    </th>
  );

  return (
    <section className={`${CARD} overflow-hidden`} aria-label="Companies">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <input
          className={`${INPUT} max-w-56`}
          placeholder="Search company or contact"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setParams({ q: q.trim() || null, page: null });
          }}
          onBlur={() => {
            if ((sp.get("q") ?? "") !== q.trim()) setParams({ q: q.trim() || null, page: null });
          }}
          aria-label="Search"
        />
        <select className={SELECT} aria-label="Filter by status" value={sp.get("status") ?? ""} onChange={(e) => setParams({ status: e.target.value || null, page: null })}>
          <option value="">All statuses</option>
          {STATUS_CODES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select className={SELECT} aria-label="Filter by channel" value={sp.get("channel") ?? ""} onChange={(e) => setParams({ channel: e.target.value || null, page: null })}>
          <option value="">All channels</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABELS[c]}
            </option>
          ))}
        </select>
        <select className={SELECT} aria-label="Filter by tier" value={sp.get("tier") ?? ""} onChange={(e) => setParams({ tier: e.target.value || null, page: null })}>
          <option value="">All tiers</option>
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {t[0]?.toUpperCase()}
              {t.slice(1)}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={sp.get("nu") === "1"} onChange={(e) => setParams({ nu: e.target.checked ? "1" : null, page: null })} />
          Needs update only
        </label>
        <span className="ml-auto text-xs text-muted">{page.total} companies</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-border">
            <tr>
              {th("company", "Company")}
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted">
                POC
              </th>
              {th("status", "Status")}
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted">
                Channel
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted">
                Tier
              </th>
              {th("amount", "Amount")}
              {th("follow_up", "Next follow-up")}
              {th("last_update", "Last update")}
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted">
                Flag
              </th>
            </tr>
          </thead>
          <tbody>
            {page.rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-muted">
                  No companies match these filters.
                </td>
              </tr>
            ) : (
              page.rows.map((r) => {
                const next = legalNextStatuses(r.crmStatus as StatusCode);
                return (
                  <tr
                    key={r.id}
                    onClick={() => setParams({ company: r.id })}
                    className={`cursor-pointer border-b border-border/60 hover:bg-background/60 ${selectedId === r.id ? "bg-background/80" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <button type="button" className="text-left font-medium hover:text-accent" onClick={(e) => { e.stopPropagation(); setParams({ company: r.id }); }}>
                        {r.name}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.poc ? (
                        <>
                          {r.poc.name}
                          {r.poc.jobTitle ? <span className="block text-muted">{r.poc.jobTitle}</span> : null}
                        </>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <select
                        className={SELECT}
                        aria-label={`Status for ${r.name}`}
                        value={r.crmStatus}
                        disabled={locked || next.length === 0}
                        onChange={(e) => setTarget({ brandId: r.id, name: r.name, to: e.target.value as StatusCode, defaultAmountInr: r.amountInr })}
                      >
                        <option value={r.crmStatus}>{STATUS_LABELS[r.crmStatus as StatusCode] ?? r.crmStatus}</option>
                        {next.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.channel ? CHANNEL_LABELS[r.channel as ChannelCode] ?? r.channel : "-"}</td>
                    <td className="px-3 py-2 text-xs capitalize">{r.tier ?? "-"}</td>
                    <td className="px-3 py-2 text-xs tabular-nums">{r.amountInr > 0 ? formatInr(r.amountInr) : "-"}</td>
                    <td className="px-3 py-2 text-xs">{fmtDay(r.nextFollowUp)}</td>
                    <td className="px-3 py-2 text-xs">{r.idleBdays === 0 ? "Today" : bdays(r.idleBdays)}</td>
                    <td className="px-3 py-2">
                      <FlagDot flag={r.flag} nextFollowUp={r.nextFollowUp} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border p-3 text-xs text-muted">
        <span>
          Page {page.page} of {pages}
        </span>
        <span className="flex gap-2">
          <button type="button" className={BTN} disabled={page.page <= 1} onClick={() => setParams({ page: String(page.page - 1) })}>
            Previous
          </button>
          <button type="button" className={BTN} disabled={page.page >= pages} onClick={() => setParams({ page: String(page.page + 1) })}>
            Next
          </button>
        </span>
      </div>

      <StatusModal target={target} onClose={() => setTarget(null)} />
    </section>
  );
}