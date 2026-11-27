"use client";

import { useMemo, useState } from "react";
import type { InventoryData } from "@/lib/db/queries/head-b-inventory";
import { suggestSlab } from "@/lib/db/queries/head-b-slab";
import { formatInr, parseInr } from "@/lib/domain/money";
import { EmptyBox } from "./KpiCards";

const range = (a: number, b: number): string => (a === b ? formatInr(a) : `${formatInr(a)} to ${formatInr(b)}`);

function SlabHelper({ data }: { data: InventoryData }) {
  const [text, setText] = useState("");
  const budget = parseInr(text) ?? 0;
  const unsold = useMemo(() => data.items.filter((i) => !i.sold), [data.items]);
  const s = useMemo(() => suggestSlab(budget, data.packages, unsold), [budget, data.packages, unsold]);
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="slab-budget" className="text-xs text-muted">Prospect budget (for example 6,00,000 or 6L)</label>
        <input
          id="slab-budget"
          value={text}
          onChange={(e) => setText(e.target.value)}
          inputMode="decimal"
          className="mt-1 h-10 w-full max-w-xs rounded-lg border border-border bg-background px-2 text-sm tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        />
      </div>
      {budget <= 0 ? (
        <p className="text-sm text-muted">Enter a budget to see the closest package and unsold add-ons.</p>
      ) : (
        <div className="space-y-2 text-sm">
          <p>
            {s.pkg ? (
              <>Closest package within budget: <span className="font-medium">{s.pkg.name}</span> at {formatInr(s.pkg.priceInr)}{s.pkg.headline ? ` (${s.pkg.headline})` : ""}.</>
            ) : (
              "No package fits this budget. Use catalogue items below."
            )}
          </p>
          {s.addons.length > 0 ? (
            <ul className="list-inside list-disc text-muted">
              {s.addons.map((a) => <li key={a.id}>{a.name} ({a.category}) from {formatInr(a.priceMin)}</li>)}
            </ul>
          ) : null}
          <p className="text-xs text-muted tabular-nums">
            Suggested spend {formatInr(s.spentInr)}, left over {formatInr(s.leftoverInr)}. Add-ons are unsold catalogue items at minimum price; check they are not already inside the package.
          </p>
        </div>
      )}
    </div>
  );
}

export function InventoryTable({ data }: { data: InventoryData }) {
  if (data.items.length === 0) return <EmptyBox message="No deliverable catalogue for this event. Run the Saarang seed." />;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted tabular-nums">
        {data.totals.sold} of {data.totals.total} items sold (SIMULATED). Unsold value {range(data.totals.unsoldMinInr, data.totals.unsoldMaxInr)}, price ranges counted from minimum to maximum.
      </p>
      <div className="overflow-x-auto rounded-[16px] border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="px-3 py-3 text-left font-medium">Category</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Items</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Sold</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Unsold</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Sold value (min)</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Unsold value</th>
            </tr>
          </thead>
          <tbody>
            {data.categories.map((c) => (
              <tr key={c.category} className="border-b border-border/60">
                <th scope="row" className="px-3 py-2 text-left font-medium">{c.category}</th>
                <td className="px-3 py-2 text-right tabular-nums">{c.total}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.sold}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.unsold}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatInr(c.soldMinInr)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{range(c.unsoldMinInr, c.unsoldMaxInr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="rounded-[16px] border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Suggest a slab</h2>
        <SlabHelper data={data} />
      </section>

      <section className="rounded-[16px] border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Packages</h2>
        <ul className="space-y-2 text-sm">
          {data.packages.map((p) => (
            <li key={p.name} className="flex flex-wrap justify-between gap-2">
              <span><span className="font-medium">{p.name}</span>{p.headline ? <span className="text-muted">: {p.headline}</span> : null}</span>
              <span className="tabular-nums">{formatInr(p.priceInr)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}