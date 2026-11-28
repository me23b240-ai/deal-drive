import { preFestCash, type PaymentTerms } from "./payments";

export const BUNDLE_DISCOUNT_OPENS = "2026-12-14";
export const IN_KIND_CAP = 0.05;

export type SlabItem = {
  name: string;
  qty: number;
  unitPriceInr: number;
  inKind: boolean;
  isCustom: boolean;
  priceMinInr: number | null;
  soldElsewhere: boolean;
};

export type CompetingDeal = { company: string; ownerName: string | null; stage: string };

/** Set by the head under events.model_assumptions.sponsorship. Every rule stays off until it has a value. */
export type SlabSettings = { exclusiveSectors: string[]; earlyBirdDeadline: string | null; earlyBirdPct: number | null };

export type SlabInput = {
  items: SlabItem[];
  discountInr: number;
  terms: PaymentTerms;
  today: string;
  sector: string | null;
  competing: CompetingDeal[];
  settings: SlabSettings;
};

export type SlabFlag = { code: "below_floor" | "in_kind_cap" | "terms_50_50" | "early_bird" | "exclusive_sector"; text: string };

export type SlabResult = {
  totalInr: number;
  floorInr: number;
  inKindInr: number;
  inKindShare: number;
  cashInr: number;
  preFestCashInr: number;
  postFestCashInr: number;
  earlyBirdInr: number | null;
  blocked: string[];
  flags: SlabFlag[];
  needsApproval: boolean;
  termsStatus: "auto" | "pending_approval";
};

export function readSlabSettings(modelAssumptions: Record<string, unknown>): SlabSettings {
  const raw = modelAssumptions.sponsorship;
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    exclusiveSectors: Array.isArray(o.exclusiveSectors) ? o.exclusiveSectors.filter((s): s is string => typeof s === "string").map((s) => s.toLowerCase()) : [],
    earlyBirdDeadline: typeof o.earlyBirdDeadline === "string" ? o.earlyBirdDeadline : null,
    earlyBirdPct: typeof o.earlyBirdPct === "number" && o.earlyBirdPct > 0 && o.earlyBirdPct < 100 ? o.earlyBirdPct : null,
  };
}

const OPEN_COMPETING = ["negotiating", "mou_sent", "partner_confirmed"];

export function evaluateSlab(input: SlabInput): SlabResult {
  const blocked: string[] = [];
  const flags: SlabFlag[] = [];

  const line = (i: SlabItem): number => i.qty * i.unitPriceInr;
  const gross = input.items.reduce((s, i) => s + line(i), 0);
  const total = Math.max(0, gross - input.discountInr);

  for (const i of input.items) if (i.soldElsewhere) blocked.push(`${i.name} is already sold on another deal.`);
  if (input.discountInr > 0 && input.today < BUNDLE_DISCOUNT_OPENS) blocked.push("Bundle discounts open on 14 Dec 2026.");

  const catalog = input.items.filter((i) => !i.isCustom && i.priceMinInr !== null);
  const floor = catalog.reduce((s, i) => s + i.qty * (i.priceMinInr ?? 0), 0);
  const catalogGross = catalog.reduce((s, i) => s + line(i), 0);
  if (floor > 0 && catalogGross - input.discountInr < floor) {
    flags.push({ code: "below_floor", text: "The price is below the catalog minimum." });
  }

  const inKind = input.items.filter((i) => i.inKind).reduce((s, i) => s + line(i), 0);
  const share = total > 0 ? inKind / total : 0;
  if (share > IN_KIND_CAP) flags.push({ code: "in_kind_cap", text: "In-kind is more than 5% of the deal." });

  if (input.terms === "50_50") flags.push({ code: "terms_50_50", text: "50/50 terms need head approval." });

  let earlyBirdInr: number | null = null;
  const s = input.settings;
  if (input.terms === "100_0" && s.earlyBirdDeadline && s.earlyBirdPct && input.today <= s.earlyBirdDeadline) {
    earlyBirdInr = Math.round(total * (1 - s.earlyBirdPct / 100));
    flags.push({ code: "early_bird", text: `Early-bird price applies until ${s.earlyBirdDeadline} and needs head approval.` });
  }

  const sector = (input.sector ?? "").toLowerCase();
  if (sector && s.exclusiveSectors.includes(sector)) {
    for (const c of input.competing.filter((d) => OPEN_COMPETING.includes(d.stage))) {
      const who = `${c.company}${c.ownerName ? ` (${c.ownerName})` : ""}`;
      if (c.stage === "partner_confirmed") blocked.push(`${who} already holds this exclusive sector.`);
      else flags.push({ code: "exclusive_sector", text: `${who} is already in ${c.stage.replace("_", " ")} for this exclusive sector.` });
    }
  }

  const cash = Math.max(0, total - inKind);
  const pre = preFestCash(cash, input.terms);
  const needsApproval = flags.length > 0;
  return {
    totalInr: total,
    floorInr: floor,
    inKindInr: inKind,
    inKindShare: share,
    cashInr: cash,
    preFestCashInr: pre,
    postFestCashInr: cash - pre,
    earlyBirdInr,
    blocked,
    flags,
    needsApproval,
    termsStatus: needsApproval ? "pending_approval" : "auto",
  };
}