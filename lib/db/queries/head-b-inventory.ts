import { requireHead } from "../guards";
import type { Ctx } from "../../types";
import type { SlabItem, SlabPackage } from "./head-b-slab";
import { fetchAll, num } from "./page";

type Row = Record<string, unknown>;

export type CatalogItem = SlabItem & { tier: string | null; sold: boolean };
export type CategoryRow = {
  category: string;
  total: number;
  sold: number;
  unsold: number;
  soldMinInr: number;
  unsoldMinInr: number;
  unsoldMaxInr: number;
};
export type InventoryData = {
  categories: CategoryRow[];
  items: CatalogItem[];
  packages: SlabPackage[];
  totals: { total: number; sold: number; unsold: number; unsoldMinInr: number; unsoldMaxInr: number };
};

export async function getInventory(ctx: Ctx): Promise<InventoryData> {
  requireHead(ctx);
  const [catalog, pkgs] = await Promise.all([
    fetchAll<Row>("deliverable_catalog", "id, category, name, price_min_inr, price_max_inr, tier, sold", { event_id: ctx.eventId }),
    fetchAll<Row>("packages", "id, name, price_inr, tier_order, headline", { event_id: ctx.eventId }),
  ]);
  const items = catalog.map((r): CatalogItem => {
    const min = num(r.price_min_inr);
    const max = r.price_max_inr === null || r.price_max_inr === undefined ? min : num(r.price_max_inr);
    return {
      id: String(r.id),
      name: String(r.name),
      category: String(r.category),
      priceMin: min,
      priceMax: Math.max(min, max),
      tier: r.tier ? String(r.tier) : null,
      sold: Boolean(r.sold),
    };
  });

  const names = [...new Set(items.map((i) => i.category))];
  const categories = names.map((category): CategoryRow => {
    const mine = items.filter((i) => i.category === category);
    const sold = mine.filter((i) => i.sold);
    const unsold = mine.filter((i) => !i.sold);
    return {
      category,
      total: mine.length,
      sold: sold.length,
      unsold: unsold.length,
      soldMinInr: sold.reduce((t, i) => t + i.priceMin, 0),
      unsoldMinInr: unsold.reduce((t, i) => t + i.priceMin, 0),
      unsoldMaxInr: unsold.reduce((t, i) => t + i.priceMax, 0),
    };
  });

  const packages = pkgs
    .sort((a, b) => num(a.tier_order) - num(b.tier_order))
    .map((p): SlabPackage => ({ name: String(p.name), priceInr: num(p.price_inr), headline: p.headline ? String(p.headline) : null }));

  return {
    categories,
    items,
    packages,
    totals: {
      total: items.length,
      sold: items.filter((i) => i.sold).length,
      unsold: items.filter((i) => !i.sold).length,
      unsoldMinInr: categories.reduce((t, c) => t + c.unsoldMinInr, 0),
      unsoldMaxInr: categories.reduce((t, c) => t + c.unsoldMaxInr, 0),
    },
  };
}