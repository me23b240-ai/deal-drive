"use client";

import { useMemo, useState } from "react";
import { formatInr } from "@/lib/domain/money";
import { PAYMENT_TERMS, TERMS_LABELS, preFestCash, type PaymentTerms } from "@/lib/domain/payments";
import { BUNDLE_DISCOUNT_OPENS, evaluateSlab, type SlabItem } from "@/lib/domain/slab";
import type { SlabLine, SlabState } from "@/lib/db/queries/crm-slab";
import { BTN, BTN_PRIMARY, CARD, INPUT, LABEL } from "./styles";
import { useMutation } from "./use-mutation";

const digits = (v: string): number => Number(v.replace(/[^0-9]/g, "")) || 0;
let counter = 0;
const newKey = (): string => `new-${(counter += 1)}`;

export function SlabBuilder({ state, locked }: { state: SlabState; locked: boolean }) {
  const { run, busy } = useMutation();
  const readOnly = locked || state.deal.locked;
  const [lines, setLines] = useState<SlabLine[]>(state.lines);
  const [discount, setDiscount] = useState(String(state.discountInr || ""));
  const [terms, setTerms] = useState<PaymentTerms>(state.deal.terms);
  const [pkg, setPkg] = useState("");
  const [search, setSearch] = useState("");
  const [custom, setCustom] = useState({ name: "", price: "" });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const items: SlabItem[] = lines.map((l) => ({ name: l.name, qty: l.qty, unitPriceInr: l.unitPriceInr, inKind: l.inKind, isCustom: l.isCustom, priceMinInr: l.priceMinInr, soldElsewhere: l.soldElsewhere }));
  const result = useMemo(
    () => evaluateSlab({ items, discountInr: digits(discount), terms, today: state.today, sector: state.brand.sector, competing: state.competing, settings: state.settings }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, discount, terms],
  );

  const inSlab = new Set(lines.map((l) => l.catalogId).filter(Boolean));
  const q = search.trim().toLowerCase();
  const catalog = state.catalog.filter((c) => !q || `${c.name} ${c.category}`.toLowerCase().includes(q));
  const update = (key: string, patch: Partial<SlabLine>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const add = (line: Omit<SlabLine, "key">) => {
    setSaved(null);
    setLines((prev) => [...prev, { ...line, key: newKey() }]);
  };

  async function save() {
    setError(null);
    setSaved(null);
    const body = {
      brandId: state.brand.id,
      items: lines.map((l) => ({ catalogId: l.catalogId, packageId: l.packageId, creatorId: l.creatorId, name: l.name, qty: l.qty, unitPriceInr: l.unitPriceInr, inKind: l.inKind })),
      discountInr: digits(discount),
      terms,
    };
    const res = await run<{ totalInr: number; termsStatus: string }>("/api/crm/slab", "POST", body, "Slab saved", { silentError: true });
    if (res.ok) setSaved(res.data.termsStatus === "pending_approval" ? `Saved at ${formatInr(res.data.totalInr)}. Needs head approval.` : `Saved at ${formatInr(res.data.totalInr)}.`);
    else setError(res.error);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(300px,2fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        <section className={`${CARD} p-4`} aria-label="Add to the slab">
          <h2 className="mb-3 text-sm font-semibold">Add to the slab</h2>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <label className={LABEL} htmlFor="sl-pkg">Package</label>
              <select id="sl-pkg" className={INPUT} value={pkg} onChange={(e) => setPkg(e.target.value)} disabled={readOnly}>
                <option value="">Choose a package...</option>
                {state.packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatInr(p.priceInr)})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className={BTN}
              disabled={readOnly || !pkg}
              onClick={() => {
                const p = state.packages.find((x) => x.id === pkg);
                if (p) add({ catalogId: null, packageId: p.id, creatorId: null, name: `${p.name} package`, category: "Package", qty: 1, unitPriceInr: p.priceInr, inKind: false, isCustom: false, isUgc: false, priceMinInr: p.priceInr, soldElsewhere: false });
                setPkg("");
              }}
            >
              Add package
            </button>
          </div>

          {state.creators.length > 0 ? (
            <div className="mt-4">
              <span className={LABEL}>Confirmed creators (UGC)</span>
              <div className="flex flex-wrap gap-2">
                {state.creators.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={BTN}
                    disabled={readOnly || lines.some((l) => l.creatorId === c.id)}
                    onClick={() => add({ catalogId: null, packageId: null, creatorId: c.id, name: `Creator: ${c.label}`, category: "Creator", qty: 1, unitPriceInr: c.rateInr ?? 0, inKind: false, isCustom: true, isUgc: true, priceMinInr: null, soldElsewhere: false })}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <label className={LABEL} htmlFor="sl-search">Catalog</label>
            <input id="sl-search" className={INPUT} placeholder="Search deliverables" value={search} onChange={(e) => setSearch(e.target.value)} />
            <ul className="mt-2 grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2">
              {catalog.map((c) => {
                const taken = inSlab.has(c.id);
                const off = readOnly || c.soldElsewhere || taken;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={off}
                      onClick={() => add({ catalogId: c.id, packageId: null, creatorId: null, name: c.name, category: c.category, qty: 1, unitPriceInr: c.priceMaxInr, inKind: false, isCustom: false, isUgc: c.ugc, priceMinInr: c.priceMinInr, soldElsewhere: false })}
                      className={`w-full rounded-lg border border-border px-3 py-2 text-left text-sm ${off ? "cursor-not-allowed opacity-50" : "hover:border-accent"}`}
                    >
                      <span className="block font-medium">
                        {c.name}
                        {c.ugc ? <span className="ml-2 text-xs text-accent">UGC</span> : null}
                      </span>
                      <span className="block text-xs text-muted">
                        {c.category} | {formatInr(c.priceMinInr)}
                        {c.priceMaxInr !== c.priceMinInr ? ` to ${formatInr(c.priceMaxInr)}` : ""}
                        {c.soldElsewhere ? " | Sold on another deal" : taken ? " | In this slab" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_160px_auto] sm:items-end">
            <div>
              <label className={LABEL} htmlFor="sl-cn">Custom line</label>
              <input id="sl-cn" className={INPUT} placeholder="Name" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} disabled={readOnly} />
            </div>
            <div>
              <label className={LABEL} htmlFor="sl-cp">Price (INR)</label>
              <input id="sl-cp" className={INPUT} inputMode="numeric" value={custom.price} onChange={(e) => setCustom({ ...custom, price: e.target.value })} disabled={readOnly} />
            </div>
            <button
              type="button"
              className={BTN}
              disabled={readOnly || !custom.name.trim()}
              onClick={() => {
                add({ catalogId: null, packageId: null, creatorId: null, name: custom.name.trim(), category: "Custom", qty: 1, unitPriceInr: digits(custom.price), inKind: false, isCustom: true, isUgc: false, priceMinInr: null, soldElsewhere: false });
                setCustom({ name: "", price: "" });
              }}
            >
              Add line
            </button>
          </div>
        </section>

        <section className={`${CARD} overflow-x-auto`} aria-label="Slab lines">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">Line</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Qty</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Unit price</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">In-kind</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Line total</th>
                <th scope="col" className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted">
                    Nothing on the slab yet.
                  </td>
                </tr>
              ) : null}
              {lines.map((l) => {
                const below = l.priceMinInr !== null && l.unitPriceInr < l.priceMinInr;
                return (
                  <tr key={l.key} className="border-b border-border/60">
                    <td className="px-3 py-2">
                      {l.name}
                      {l.priceMinInr !== null ? <span className={`block text-xs ${below ? "text-approx" : "text-muted"}`}>Minimum {formatInr(l.priceMinInr)}</span> : null}
                    </td>
                    <td className="px-3 py-2">
                      <input aria-label={`Quantity for ${l.name}`} className={`${INPUT} w-16`} inputMode="numeric" value={l.qty} disabled={readOnly} onChange={(e) => update(l.key, { qty: Math.max(1, Math.min(50, digits(e.target.value))) })} />
                    </td>
                    <td className="px-3 py-2">
                      <input aria-label={`Price for ${l.name}`} className={`${INPUT} w-32`} inputMode="numeric" value={l.unitPriceInr} disabled={readOnly} onChange={(e) => update(l.key, { unitPriceInr: digits(e.target.value) })} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="checkbox" aria-label={`${l.name} is in-kind`} checked={l.inKind} disabled={readOnly} onChange={(e) => update(l.key, { inKind: e.target.checked })} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatInr(l.qty * l.unitPriceInr)}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" className={BTN} disabled={readOnly} onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}>
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>

      <aside className={`${CARD} flex h-fit flex-col gap-4 p-4`} aria-label="Slab summary">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Summary</h2>
          {result.needsApproval ? <span className="rounded-full border border-approx/40 bg-approx/10 px-2 py-0.5 text-xs text-approx">Needs head approval</span> : null}
        </div>

        <div>
          <label className={LABEL} htmlFor="sl-disc">
            Bundle discount (INR, opens {BUNDLE_DISCOUNT_OPENS})
          </label>
          <input id="sl-disc" className={INPUT} inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value)} disabled={readOnly} />
        </div>

        <fieldset>
          <legend className={LABEL}>Payment terms</legend>
          <div className="flex flex-col gap-2">
            {PAYMENT_TERMS.map((t) => (
              <label key={t} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <input type="radio" name="terms" checked={terms === t} disabled={readOnly} onChange={() => setTerms(t)} />
                  {TERMS_LABELS[t]}
                </span>
                <span className="text-xs text-muted tabular-nums">Pre-fest {formatInr(preFestCash(result.cashInr, t))}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Deal total</dt>
          <dd className="font-medium tabular-nums">{formatInr(result.totalInr)}</dd>
          <dt className="text-muted">In-kind ({Math.round(result.inKindShare * 1000) / 10}%)</dt>
          <dd className="tabular-nums">{formatInr(result.inKindInr)}</dd>
          <dt className="text-muted">Cash</dt>
          <dd className="tabular-nums">{formatInr(result.cashInr)}</dd>
          <dt className="text-muted">Cash before the fest</dt>
          <dd className="tabular-nums">{formatInr(result.preFestCashInr)}</dd>
          <dt className="text-muted">Cash after the fest</dt>
          <dd className="tabular-nums">{formatInr(result.postFestCashInr)}</dd>
          {result.earlyBirdInr !== null ? (
            <>
              <dt className="text-muted">Early-bird price</dt>
              <dd className="tabular-nums">{formatInr(result.earlyBirdInr)}</dd>
            </>
          ) : null}
        </dl>

        {result.blocked.length > 0 ? (
          <ul role="alert" className="flex flex-col gap-1 text-sm text-danger">
            {result.blocked.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : null}
        {result.flags.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm text-approx">
            {result.flags.map((f) => (
              <li key={f.code + f.text}>{f.text}</li>
            ))}
          </ul>
        ) : null}
        {state.deal.termsStatus === "pending_approval" ? <p className="text-xs text-muted">The saved slab is waiting for head approval.</p> : null}
        {state.deal.locked ? <p className="text-xs text-muted">This slab is locked because the deal is past negotiation.</p> : null}

        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        {saved ? <p role="status" className="text-sm text-success">{saved}</p> : null}
        <button type="button" className={BTN_PRIMARY} disabled={readOnly || busy || lines.length === 0 || result.blocked.length > 0} onClick={save}>
          {busy ? "Saving..." : result.needsApproval ? "Save and request approval" : "Save slab"}
        </button>
      </aside>
    </div>
  );
}