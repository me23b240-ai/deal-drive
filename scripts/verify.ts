import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { DEFAULT_GEMINI_MODEL } from "../lib/ai/gemini";
import { computeAnchors, parseCampusFest, type Anchors } from "../lib/seed/campusfest-parse";

config({ path: ".env.local" });

let fails = 0;
let warns = 0;
function report(label: string, ok: boolean, detail = "", soft = false) {
  if (ok) console.log(`PASS ${label}${detail ? " " + detail : ""}`);
  else if (soft) {
    warns += 1;
    console.log(`WARN ${label} ${detail}`);
  } else {
    fails += 1;
    console.log(`FAIL ${label} ${detail}`);
  }
}

type R = Record<string, unknown>;

async function fetchAll(sb: SupabaseClient, table: string, select: string, eq?: [string, string]): Promise<R[]> {
  const out: R[] = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(select).range(from, from + 999);
    if (eq) q = q.eq(eq[0], eq[1]);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as R[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function countOf(sb: SupabaseClient, table: string, eq: [string, string][]): Promise<number> {
  let q = sb.from(table).select("id", { count: "exact", head: true });
  for (const [k, v] of eq) q = q.eq(k, v);
  const { count, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

const EXPECTED = {
  brands: 180, contacts: 270, campaigns: 6, opportunities: 58, confirmed: 24,
  confirmedValue: 2_240_000, cashValue: 2_000_000, inKindValue: 240_000, qualified: 60,
  optOuts: 7, warmBrands: 44, warmOpps: 25, warmSigned: 24, nonWarmBrands: 141,
  removed: { interactions: 3, qualification: 1, history: 2 },
  campaignValue: { SC02: 785_000, SC04: 670_000, SC05: 785_000 } as Record<string, number>,
  days: { median: 10, min: 5, max: 13 },
};

function checkXlsx(a: Anchors, removed: { interactions: number; qualification: number; history: number }) {
  console.log("--- CampusFest anchors from the xlsx");
  const eq = (label: string, got: number, want: number) =>
    report(`xlsx ${label}`, got === want, `got=${got} expected=${want}`, true);
  eq("duplicate interactions removed", removed.interactions, EXPECTED.removed.interactions);
  eq("duplicate qualification removed", removed.qualification, EXPECTED.removed.qualification);
  eq("duplicate history removed", removed.history, EXPECTED.removed.history);
  eq("brands", a.brands, EXPECTED.brands);
  eq("contacts", a.contacts, EXPECTED.contacts);
  eq("campaigns", a.campaigns, EXPECTED.campaigns);
  eq("opportunities", a.opportunities, EXPECTED.opportunities);
  eq("partner_confirmed (latest)", a.confirmed, EXPECTED.confirmed);
  eq("confirmed value", a.confirmedValue, EXPECTED.confirmedValue);
  eq("cash value", a.cashValue, EXPECTED.cashValue);
  eq("in-kind value", a.inKindValue, EXPECTED.inKindValue);
  eq("qualified brands (latest)", a.qualifiedBrands, EXPECTED.qualified);
  eq("opt-outs", a.optOuts, EXPECTED.optOuts);
  eq("warm brands touched (SC02+SC04+SC05)", a.warm.brandsTouched, EXPECTED.warmBrands);
  eq("warm opportunities", a.warm.opportunities, EXPECTED.warmOpps);
  eq("warm signed", a.warm.signed, EXPECTED.warmSigned);
  eq("non-warm signed", a.nonWarm.signed, 0);
  eq("non-warm brands touched (distinct)", a.nonWarm.brandsTouched, EXPECTED.nonWarmBrands);
  for (const [sc, want] of Object.entries(EXPECTED.campaignValue)) {
    eq(`signed value ${sc}`, a.perCampaign[sc]?.signedValue ?? 0, want);
  }
  if (a.days) {
    eq("days to confirm median", a.days.median, EXPECTED.days.median);
    eq("days to confirm min", a.days.min, EXPECTED.days.min);
    eq("days to confirm max", a.days.max, EXPECTED.days.max);
  }
  console.log(
    `INFO non-warm campaign-level sum=${a.nonWarm.campaignSum}, SC01+SC03 distinct=${a.nonWarm.brandsTouchedExRevival}`,
  );
  const sc06 = a.perCampaign["SC06"];
  console.log(
    `INFO SC06 Past Conversation Revival: brands=${sc06?.brandsTouched} opportunities=${sc06?.opportunities} signed=${sc06?.signed}`,
  );
}

async function checkDb(sb: SupabaseClient, eventId: string, a: Anchors) {
  console.log(`--- database vs xlsx for ${eventId}`);
  const brands = await fetchAll(sb, "brands", "id, qualification", ["event_id", eventId]);
  if (brands.length === 0) {
    report(`${eventId} seeded`, false, "no brands: run npm run seed:campusfest", true);
    return;
  }
  const ids = new Set(brands.map((b) => String(b.id)));
  const contacts = (await fetchAll(sb, "contacts", "id, brand_id")).filter((c) => ids.has(String(c.brand_id)));
  const deals = await fetchAll(sb, "deals", "stage, signed_value_inr, signed_cash_inr, signed_in_kind_inr", [
    "event_id",
    eventId,
  ]);
  const confirmed = deals.filter((d) => d.stage === "partner_confirmed");
  const sum = (rows: R[], k: string) => rows.reduce((t, r) => t + Number(r[k] ?? 0), 0);
  const same = (label: string, got: number, want: number) =>
    report(`${eventId} ${label}`, got === want, `db=${got} xlsx=${want}`);

  same("brands", brands.length, a.brands);
  same("contacts", contacts.length, a.contacts);
  same("campaigns", await countOf(sb, "campaigns", [["event_id", eventId]]), a.campaigns);
  same("deals", deals.length, a.opportunities);
  same("partner_confirmed", confirmed.length, a.confirmed);
  same("confirmed value", sum(confirmed, "signed_value_inr"), a.confirmedValue);
  same("cash value", sum(confirmed, "signed_cash_inr"), a.cashValue);
  same("in-kind value", sum(confirmed, "signed_in_kind_inr"), a.inKindValue);
  same("qualified brands", brands.filter((b) => b.qualification === "qualified").length, a.qualifiedBrands);
  same(
    "opt-out activities",
    await countOf(sb, "activities", [["event_id", eventId], ["event_type", "opt_out"]]),
    a.optOuts,
  );
}

function writeAnchors(a: Anchors) {
  const pct = (x: number, y: number) => (y ? ((100 * x) / y).toFixed(1) + "%" : "n/a");
  const lines = [
    "# Slide 1 anchors (CampusFest 2025, computed by npm run verify)",
    "",
    `- Brands ${a.brands}, contacts ${a.contacts}, campaigns ${a.campaigns}, opportunities ${a.opportunities}`,
    `- Signed: ${a.confirmed} of ${a.opportunities} (${pct(a.confirmed, a.opportunities)})`,
    `- Confirmed value INR ${a.confirmedValue} = cash ${a.cashValue} (${a.cashDeals} deals) + in-kind ${a.inKindValue} (${a.inKindDeals} deals)`,
    `- In-kind share ${pct(a.inKindValue, a.confirmedValue)}`,
    `- Average signed deal INR ${a.confirmed ? Math.round(a.confirmedValue / a.confirmed) : 0}`,
    `- Qualified brands (latest) ${a.qualifiedBrands}`,
    `- Opt-outs ${a.optOuts} ${JSON.stringify(a.optOutsByCampaign)}`,
    a.days ? `- Days created to confirmed: median ${a.days.median}, min ${a.days.min}, max ${a.days.max}` : "- Days to confirm: n/a",
    `- WARM (SC02+SC04+SC05): distinct brands touched ${a.warm.brandsTouched}, opportunities ${a.warm.opportunities}, signed ${a.warm.signed}`,
    `- NON-WARM (SC01+SC03+SC06): distinct brands touched ${a.nonWarm.brandsTouched}, signed ${a.nonWarm.signed}`,
    `- Campaign-level sum for non-warm (double counts brands): ${a.nonWarm.campaignSum}; SC01+SC03 distinct: ${a.nonWarm.brandsTouchedExRevival}`,
    "",
    "## Per campaign",
    "",
    "| Campaign | Brands touched | Opportunities | Signed | Signed value INR |",
    "|---|---|---|---|---|",
    ...Object.entries(a.perCampaign)
      .sort(([x], [y]) => x.localeCompare(y))
      .map(([sc, v]) => `| ${sc} | ${v.brandsTouched} | ${v.opportunities} | ${v.signed} | ${v.signedValue} |`),
    "",
  ];
  mkdirSync("docs", { recursive: true });
  writeFileSync("docs/slide1-anchors.md", lines.join("\n"), "utf8");
  console.log("wrote docs/slide1-anchors.md");
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    console.log("FAIL missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (names only)");
    process.exit(1);
  }
  const sb = createClient(url, service, { auth: { persistSession: false } });

  console.log("--- schema");
  const ping = await sb.from("events").select("id", { head: true, count: "exact" }).limit(1);
  report("connection", !ping.error, ping.error?.message ?? "");
  const relations = [
    "status_events", "weekly_targets", "fact_bank", "portfolio_gates",
    "v_needs_update", "v_deal_desk", "v_initiative_funnel", "v_warmth_funnel",
  ];
  for (const rel of relations) {
    const { error } = await sb.from(rel).select("*", { head: true, count: "exact" }).limit(1);
    report(`relation ${rel}`, !error, error?.message ?? "");
  }

  const parsed = await parseCampusFest("data/Sponsor_Dataset.xlsx");
  const anchors = computeAnchors(parsed);
  checkXlsx(anchors, parsed.removed);
  writeAnchors(anchors);

  if (!ping.error) {
    await checkDb(sb, "campusfest-2025", anchors);
    await checkDb(sb, "campusfest-2025-work", anchors);
    const saarang = await countOf(sb, "brands", [["event_id", "saarang-2027"]]);
    console.log("--- saarang-2027");
    if (saarang === 0) console.log("SKIP no Saarang data yet (seed:saarang arrives in the next part)");
  }

  if (!process.argv.includes("--no-gemini")) {
    console.log("--- gemini");
    const key = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    if (!key) report("gemini key", false, "GEMINI_API_KEY missing");
    else {
      try {
        const ai = new GoogleGenAI({ apiKey: key });
        const res = await ai.models.generateContent({ model, contents: "Reply with the single word OK" });
        report(`gemini ${model}`, true, `chars=${(res.text ?? "").length}`);
      } catch (error: unknown) {
        report(`gemini ${model}`, false, error instanceof Error ? error.message : "unknown error");
      }
    }
  }

  console.log(`\nSummary: ${fails} FAIL, ${warns} WARN`);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});