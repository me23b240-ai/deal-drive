import { config } from "dotenv";
import type { Ctx } from "../lib/types";

config({ path: ".env.local" });

const EVENT = "saarang-2027";
let fails = 0;
function check(label: string, ok: boolean, detail = "", soft = false): void {
  if (ok) console.log(`PASS ${label}${detail ? " " + detail : ""}`);
  else {
    if (!soft) fails += 1;
    console.log(`${soft ? "WARN" : "FAIL"} ${label} ${detail}`);
  }
}
const near = (a: number, b: number, tol = 1000): boolean => Math.abs(a - b) <= tol;

async function main(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("FAIL missing env names");
    process.exit(1);
  }
  const { getEventInfo } = await import("../lib/db/queries/events");
  const { toIstDate, todayIST } = await import("../lib/domain/bizdays");
  const { getPlanModel, getGateReport } = await import("../lib/db/queries/plan");
  const { getHeadKpis } = await import("../lib/db/queries/overview");
  const { getInitiativeStatuses } = await import("../lib/db/queries/initiatives");
  const { getDecisions } = await import("../lib/db/queries/decisions");
  const { getScenarioView } = await import("../lib/db/queries/head-a-planextras");
  const { getPeerFestBoard } = await import("../lib/db/queries/head-a-peerfests");
  const { getApprovalBoard } = await import("../lib/db/queries/head-a-approvals");
  const { getLeadsBoard } = await import("../lib/db/queries/head-a-leads");
  const { formatInr } = await import("../lib/domain/money");

  const info = await getEventInfo(EVENT);
  if (!info) {
    console.log("FAIL no saarang-2027 event: run npm run seed:saarang");
    process.exit(1);
  }
  const ctx: Ctx = {
    eventId: info.id,
    event: info,
    role: "head",
    memberId: null,
    isCloser: false,
    todayIst: info.as_of ? toIstDate(info.as_of) : todayIST(),
    isLocked: info.is_seed,
  };
  console.log(`INFO today (IST) = ${ctx.todayIst}`);

  console.log("--- model");
  const plan = await getPlanModel(ctx);
  const p = plan.projection;
  check("floor cash is \u20B97,42,500", p.floor === 742_500, `got ${p.floor}`);
  check("base signed is \u20B922,07,500", p.base.signed === 2_207_500, `got ${p.base.signed}`);
  check("base cash before fest is \u20B914,90,063", p.base.cashBeforeFest === 1_490_063, `got ${p.base.cashBeforeFest}`);
  check("stretch signed is \u20B935,07,500", p.stretch.signed === 3_507_500, `got ${p.stretch.signed}`);
  check("stretch cash before fest is \u20B924,99,094", p.stretch.cashBeforeFest === 2_499_094, `got ${p.stretch.cashBeforeFest}`);
  check("stretch uses 60 warm and 42 other leads", plan.settings.stretchWarmLeads === 60 && plan.settings.stretchOtherLeads === 42);
  check("warm split is 45 network and 15 referral", plan.settings.warmSplit.network === 45 && plan.settings.warmSplit.referral === 15);
  check("warm pool is 25", plan.leadSupply.warmPool === 25, `got ${plan.leadSupply.warmPool}`);
  check("gap to stretch is 35 warm leads", plan.leadSupply.gapToStretch === 35, `got ${plan.leadSupply.gapToStretch}`);
  console.log(`INFO open prospects ${plan.state.openProspectCount} = ${plan.state.openProspectInr}; signed ${plan.state.signedDealsToDate} deals = ${plan.state.signedToDate}`);

  console.log("--- attribution");
  const by = Object.fromEntries(plan.attribution.rows.map((r) => [r.bet, r.cashOverFloor]));
  check("bet-1 is \u20B98,30,250", near(by["bet-1"] ?? 0, 830_250));
  check("bet-2 is about \u20B94,23,700", near(by["bet-2"] ?? 0, 423_700));
  check("bet-3 is about \u20B93,35,000", near(by["bet-3"] ?? 0, 335_000));
  check("bet-4 is about \u20B91,41,200", near(by["bet-4"] ?? 0, 141_200));
  check("bet-5 is about \u20B926,400", near(by["bet-5"] ?? 0, 26_400));
  check("attribution reconciles to stretch", plan.attribution.reconciles, `sum over floor ${plan.attribution.sumOverFloor}`);
  for (const r of plan.attribution.rows) console.log(`INFO ${r.bet} ${r.label}: ${formatInr(r.cashOverFloor)}`);

  console.log("--- scenarios");
  const sc = await getScenarioView(ctx);
  const rows = Object.fromEntries(sc.rows.map((r) => [r.key, r]));
  check("six scenarios", sc.rows.length === 6, sc.rows.map((r) => r.key).join());
  check("scenarios rise in order", (rows.floor?.cash ?? 0) < (rows.downside?.cash ?? 0) && (rows.downside?.cash ?? 0) < (rows.base?.cash ?? 0) && (rows.base?.cash ?? 0) < (rows.stretch?.cash ?? 0) && (rows.stretch?.cash ?? 0) < (rows.upside?.cash ?? 0));
  check("scenario stretch equals the plan stretch", rows.stretch?.cash === p.stretch.cashBeforeFest);
  check("upside uses 85 warm leads", rows.upside?.cash === 2_833_078, `got ${rows.upside?.cash}`);
  check("pre-fest share is observed at 75%", sc.prefest.observed !== null && Math.abs(sc.prefest.observed - 0.75) < 0.001, `got ${sc.prefest.observed}`, true);
  for (const r of sc.rows) console.log(`INFO scenario ${r.label}: signed ${formatInr(r.signed)}, cash ${formatInr(r.cash)}`);
  console.log(`INFO moonshot=${sc.moonshot} (${sc.extraQualified} qualified peer-fest leads, by ${sc.byDate})`);

  console.log("--- kpis and gates");
  const kpis = await getHeadKpis(ctx);
  check("14 open prospects worth \u20B930,75,000", kpis.prospective.count === 14 && kpis.prospective.inr === 3_075_000, `got ${kpis.prospective.count} / ${kpis.prospective.inr}`);
  check("signed total is \u20B911,00,000", kpis.signedInr === 1_100_000, `got ${kpis.signedInr}`);
  console.log(`INFO funnel ${kpis.funnel.map((f) => `${f.label}=${f.count}`).join(", ")}; bottleneck=${kpis.bottleneck}`);
  console.log(`INFO cash scheduled ${kpis.cashScheduledInr}, collected ${kpis.cashCollectedInr}, pending ${kpis.cashPendingInr}`);

  const gates = await getGateReport(ctx);
  check("three gates exist", gates.statuses.length === 3, `${gates.statuses.length} gates, closing-only=${gates.closingOnly}`);
  const gb = gates.statuses.map((g) => g.baseInr).join();
  const gs = gates.statuses.map((g) => g.stretchInr).join();
  check("gate base values", gb === "1321500,1543000,1764500", gb);
  check("gate stretch values", gs === "1581500,2063000,2544500", gs);
  for (const g of gates.statuses) console.log(`INFO gate ${g.gateOn} ${g.status} base=${g.baseInr} stretch=${g.stretchInr} actual=${g.actualInr}`);

  console.log("--- bets");
  const inits = await getInitiativeStatuses(ctx);
  check("five initiatives evaluated", inits.length === 5 && inits.map((i) => i.code).join() === "bet-1,bet-2,bet-3,bet-4,bet-5", inits.map((i) => i.code).join());
  const names = inits.map((i) => i.name).join(" | ");
  check("new bet names are seeded", /MoU/.test(names) && /Warm network/.test(names) && /Offer design/.test(names) && /Referral/.test(names) && /Lead engine/.test(names), names);
  for (const i of inits) console.log(`INFO ${i.code} ${i.badge}: ${i.reason}`);
  const bet5 = inits.find((i) => i.code === "bet-5");
  if (bet5?.experiment) {
    const e = bet5.experiment;
    console.log(`INFO bet-5 experiment: personalised ${e.personalised.reached}/${e.personalised.n}, template ${e.template.reached}/${e.template.n}, directional only=${e.directionalOnly}`);
  }

  console.log("--- decisions");
  const decisions = await getDecisions(ctx);
  check("decisions are raised", decisions.length > 0, `${decisions.length} decisions`);
  check("high severity is first", decisions.length > 0 && decisions[0]?.severity === "high", `first is ${decisions[0]?.id}`, true);
  const stale = decisions.find((d) => d.id === "stale-prospects");
  check("stale prospects decision names the \u20B95,00,000 deal", !!stale && stale.evidence.includes("5,00,000"));
  check("an idle coordinator decision exists", decisions.some((d) => d.id.startsWith("idle-")), "", true);
  check("a ghosting decision exists", decisions.some((d) => d.id.startsWith("ghost-")), "", true);
  check("peer-fest research decision exists after the plan starts", decisions.some((d) => d.id === "peerfest-research") || ctx.todayIst < "2026-12-03", "", true);
  for (const d of decisions) console.log(`INFO [${d.severity}] ${d.id}: ${d.title}`);

  console.log("--- v2 screens");
  const fests = await getPeerFestBoard(ctx);
  check("12 peer fests", fests.fests.length === 12, `got ${fests.fests.length} (run npm run seed:peerfests)`, true);
  check("30 simulated sponsors", fests.fests.reduce((t, f) => t + f.sponsors.length, 0) === 30, "", true);
  check("every simulated sponsor is flagged", fests.fests.every((f) => f.sponsors.every((s) => s.isSimulated)), "", true);
  const approvals = await getApprovalBoard(ctx);
  console.log(`INFO approvals waiting: ${approvals.pending.length}`);
  const leads = await getLeadsBoard(ctx);
  console.log(`INFO lead candidates: ${JSON.stringify(leads.counts)}`);

  console.log("\n--- final numbers");
  console.log(`floor ${formatInr(p.floor)} | base ${formatInr(p.base.cashBeforeFest)} | stretch ${formatInr(p.stretch.cashBeforeFest)} | upside ${formatInr(rows.upside?.cash ?? 0)}`);
  console.log(`signed: base ${formatInr(p.base.signed)} | stretch ${formatInr(p.stretch.signed)}`);

  console.log(`\nSummary: ${fails} FAIL`);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});