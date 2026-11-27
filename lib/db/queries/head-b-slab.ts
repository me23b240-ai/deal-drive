export type SlabPackage = { name: string; priceInr: number; headline: string | null };
export type SlabItem = { id: string; name: string; category: string; priceMin: number; priceMax: number };
export type SlabSuggestion = { pkg: SlabPackage | null; addons: SlabItem[]; spentInr: number; leftoverInr: number };

/** Largest package within budget, then unsold catalogue add-ons (at minimum price) with what is left. */
export function suggestSlab(budget: number, packages: SlabPackage[], unsold: SlabItem[]): SlabSuggestion {
  if (!(budget > 0)) return { pkg: null, addons: [], spentInr: 0, leftoverInr: 0 };
  const pkg = [...packages].filter((p) => p.priceInr <= budget).sort((a, b) => b.priceInr - a.priceInr)[0] ?? null;
  let left = budget - (pkg?.priceInr ?? 0);
  const addons: SlabItem[] = [];
  for (const it of [...unsold].sort((a, b) => b.priceMin - a.priceMin)) {
    if (addons.length >= 6) break;
    if (it.priceMin > 0 && it.priceMin <= left) {
      addons.push(it);
      left -= it.priceMin;
    }
  }
  return { pkg, addons, spentInr: budget - left, leftoverInr: left };
}