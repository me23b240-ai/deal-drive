import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { businessDaysBetween, todayIST, weekStartIST } from "../lib/domain/bizdays";
import { WARM_CHANNELS, type ChannelCode } from "../lib/domain/channels";

config({ path: ".env.local" });

const EVENT = "saarang-2027";
let fails = 0;
function check(label: string, ok: boolean, detail = "", soft = false) {
  if (ok) console.log(`PASS ${label}${detail ? " " + detail : ""}`);
  else {
    if (!soft) fails += 1;
    console.log(`${soft ? "WARN" : "FAIL"} ${label} ${detail}`);
  }
}
type R = Record<string, unknown>;

async function all(sb: SupabaseClient, table: string, select: string, byEvent = true): Promise<R[]> {
  const out: R[] = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(select).range(from, from + 999);
    if (byEvent) q = q.eq("event_id", EVENT);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as R[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const num = (v: unknown): number => Number(v ?? 0);
const sum = (rows: R[], k: string): number => rows.reduce((t, r) => t + num(r[k]), 0);
const norm = (name: string): string =>
  name.toLowerCase().replace(/\b(pvt|ltd|limited|india|group)\b\.?/g, "").replace(/\s+/g, " ").trim();

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("FAIL missing env names");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const brands = await all(sb, "brands", "id, name, owner_id, crm_status, source_channel, approx_amount_inr, first_outreach_at, first_response_at");
  if (brands.length === 0) {
    console.log("FAIL no saarang-2027 data: run npm run seed:saarang");
    process.exit(1);
  }
  const team = await all(sb, "team_members", "id, name, role");
  const nameOf = new Map(team.map((t) => [String(t.id), String(t.name)]));
  const idOf = (name: string): string => String(team.find((t) => t.name === name)?.id ?? "");

  console.log("--- status counts");
  const want: Record<string, number> = { to_contact: 55, send_mail: 12, slabs_sent: 28, didnt_pick: 14, contacted: 30, ghosting: 14, prospective: 14, converted: 4, rejected: 42, left_company: 4, wrong_number: 3 };
  const got: Record<string, number> = {};
  for (const b of brands) got[String(b.crm_status)] = (got[String(b.crm_status)] ?? 0) + 1;
  for (const [s, n] of Object.entries(want)) check(`status ${s}`, got[s] === n, `db=${got[s] ?? 0} want=${n}`);
  check("total companies", brands.length === 220, `db=${brands.length}`);

  const warm = (b: R) => WARM_CHANNELS.has(String(b.source_channel) as ChannelCode);
  const queue = brands.filter((b) => b.crm_status === "to_contact" || b.crm_status === "send_mail");
  check("queue 67", queue.length === 67, `db=${queue.length}`);
  check("queue warm 25", queue.filter(warm).length === 25, `db=${queue.filter(warm).length}`);
  check("queue other 42", queue.filter((b) => !warm(b)).length === 42, `db=${queue.filter((b) => !warm(b)).length}`);
  check("queue has no artist_linked", queue.filter((b) => b.source_channel === "artist_linked").length === 0);
  const inflight = brands.filter((b) => ["slabs_sent", "didnt_pick", "contacted", "ghosting"].includes(String(b.crm_status))).length;
  check("in flight 86", inflight === 86, `db=${inflight}`);

  console.log("--- prospects and signed");
  const pros = brands.filter((b) => b.crm_status === "prospective");
  const amounts = pros.map((b) => num(b.approx_amount_inr)).sort((a, b) => b - a);
  const total = amounts.reduce((t, v) => t + v, 0);
  check("prospective amount 30,75,000", total === 3_075_000, `db=${total}`);
  const top5 = amounts.slice(0, 5).reduce((t, v) => t + v, 0);
  check("top-5 share 58.5%", Math.abs(top5 / total - 0.585) < 0.001, `db=${((100 * top5) / total).toFixed(1)}%`);
  const deals = await all(sb, "deals", "id, stage, signed_value_inr, signed_cash_inr, signed_in_kind_inr");
  const confirmed = deals.filter((d) => d.stage === "partner_confirmed");
  check("signed deals 4", confirmed.length === 4, `db=${confirmed.length}`);
  check("signed 11,00,000", sum(confirmed, "signed_value_inr") === 1_100_000, `db=${sum(confirmed, "signed_value_inr")}`);
  check("signed cash 9,90,000", sum(confirmed, "signed_cash_inr") === 990_000, `db=${sum(confirmed, "signed_cash_inr")}`);
  check("signed in-kind 1,10,000", sum(confirmed, "signed_in_kind_inr") === 110_000, `db=${sum(confirmed, "signed_in_kind_inr")}`);
  const dealIds = new Set(deals.map((d) => String(d.id)));
  const pays = (await all(sb, "payments", "deal_id, amount_inr, phase, received_at", false)).filter((p) => dealIds.has(String(p.deal_id)));
  const pre = pays.filter((p) => p.phase === "pre_fest");
  const post = pays.filter((p) => p.phase === "post_fest");
  check("pre-fest scheduled 7,42,500", sum(pre, "amount_inr") === 742_500, `db=${sum(pre, "amount_inr")}`);
  check("post-fest scheduled 2,47,500", sum(post, "amount_inr") === 247_500, `db=${sum(post, "amount_inr")}`);
  check("collected 3,30,000", sum(pays.filter((p) => p.received_at), "amount_inr") === 330_000, `db=${sum(pays.filter((p) => p.received_at), "amount_inr")}`);

  console.log("--- planted stories");
  const rohan = idOf("Rohan Mehta");
  const ishita = idOf("Ishita Rao");
  const rg = brands.filter((b) => b.owner_id === rohan && b.crm_status === "ghosting").length;
  check("Rohan holds 8 of 14 ghosting", rg === 8, `db=${rg}`);
  const needs = await all(sb, "v_needs_update", "company, owner_id, crm_status, idle_bdays, approx_amount_inr");
  const ishitaFlags = needs.filter((r) => r.owner_id === ishita);
  check("Ishita has at least 10 needs-update rows", ishitaFlags.length >= 10, `db=${ishitaFlags.length}`);
  const topIdle = [...needs.reduce((m, r) => m.set(String(r.owner_id), (m.get(String(r.owner_id)) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0];
  check("Ishita has the most stale companies", topIdle?.[0] === ishita, `top=${nameOf.get(String(topIdle?.[0]))} (${topIdle?.[1]})`);
  const desk = await all(sb, "v_deal_desk", "company, idle_bdays, proposed_inr");
  const nw = desk.find((r) => r.company === "Northwind Motors (demo)");
  check("Northwind Motors idle 8 business days in deal desk", num(nw?.idle_bdays) === 8, `db=${nw?.idle_bdays}`);
  check("Northwind amount 5,00,000", num(nw?.proposed_inr) === 500_000);
  const groups = new Map<string, Set<string>>();
  for (const b of brands) {
    const k = norm(String(b.name));
    groups.set(k, (groups.get(k) ?? new Set()).add(String(b.owner_id)));
  }
  const conflicts = [...groups.values()].filter((s) => s.size >= 2).length;
  check("2 ownership conflicts", conflicts === 2, `db=${conflicts}`);
  const staleTc = needs.filter((r) => r.crm_status === "to_contact").length;
  check("about 6 to_contact older than 5 business days", staleTc >= 4 && staleTc <= 9, `db=${staleTc}`);
  const eod = await all(sb, "eod_reports", "member_id, report_date", false);
  const ishitaEod = eod.filter((r) => r.member_id === ishita).map((r) => String(r.report_date)).sort();
  check("Ishita has no EOD in the last 3 business days", ishitaEod.length === 2, `reports=${ishitaEod.length}`);

  console.log("--- views vs direct counts");
  const coord = await all(sb, "v_coord_summary", "*");
  const direct = {
    total_outreached: brands.filter((b) => b.first_outreach_at).length,
    total_responded: brands.filter((b) => b.first_response_at).length,
    prospective: got.prospective ?? 0, converted: got.converted ?? 0, rejected: got.rejected ?? 0, ghosting: got.ghosting ?? 0,
  };
  for (const [k, v] of Object.entries(direct)) check(`v_coord_summary ${k}`, sum(coord, k) === v, `view=${sum(coord, k)} direct=${v}`);

  console.log("--- window");
  const hol = (await all(sb, "holidays", "day")).map((h) => ({ day: String(h.day) }));
  check("25 business days from 27 Nov to 5 Jan", businessDaysBetween("2026-11-27", "2027-01-05", hol) === 25);
  console.log(`INFO business days from today (${todayIST()}) to 2027-01-05: ${businessDaysBetween(todayIST(), "2027-01-05", hol)}`);

  console.log("--- this week and observed rates (INFO)");
  const wk = weekStartIST(todayIST());
  const prog = await all(sb, "v_weekly_progress", "owner_id, week_start, outreached, responded");
  for (const t of team.filter((x) => x.role === "member")) {
    const r = prog.find((p) => p.owner_id === t.id && p.week_start === wk);
    console.log(`INFO ${String(t.name).padEnd(16)} outreached=${num(r?.outreached)} responded=${num(r?.responded)} (target 10)`);
  }
  const warmth = await all(sb, "v_warmth_funnel", "*");
  for (const w of warmth) {
    const o = num(w.outreached), r = num(w.responded), p = num(w.prospective_or_better);
    console.log(`INFO ${String(w.warmth)}: outreached=${o} responded=${r} (${o ? ((100 * r) / o).toFixed(0) : 0}%) prospective_or_better=${p} (${r ? ((100 * p) / r).toFixed(0) : 0}% of responded) converted=${num(w.converted)}`);
  }

  console.log(`\nSummary: ${fails} FAIL`);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});