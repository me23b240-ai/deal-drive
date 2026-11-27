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

  const plan = await getPlanModel(ctx);
  check("floor cash is \u20B97,42,500", plan.projection.floor === 742_500, `got ${plan.projection.floor}`);
  check("base cash before fest is \u20B914,90,063", plan.projection.base.cashBeforeFest === 1_490_063, `got ${plan.projection.base.cashBeforeFest}`);
  check("stretch cash before fest is \u20B928,33,078", plan.projection.stretch.cashBeforeFest === 2_833_078, `got ${plan.projection.stretch.cashBeforeFest}`);
  check("attribution reconciles to stretch", plan.attribution.reconciles, `sum over floor ${plan.attribution.sumOverFloor}`);
  check("warm pool is 25", plan.leadSupply.warmPool === 25, `got ${plan.leadSupply.warmPool}`);
  check("gap to stretch is 60 warm leads", plan.leadSupply.gapToStretch === 60, `got ${plan.leadSupply.gapToStretch}`);
  console.log(`INFO open prospects ${plan.state.openProspectCount} = ${plan.state.openProspectInr}; signed ${plan.state.signedDealsToDate} deals = ${plan.state.signedToDate}`);

  const kpis = await getHeadKpis(ctx);
  check("14 open prospects worth \u20B930,75,000", kpis.prospective.count === 14 && kpis.prospective.inr === 3_075_000, `got ${kpis.prospective.count} / ${kpis.prospective.inr}`);
  check("signed total is \u20B911,00,000", kpis.signedInr === 1_100_000, `got ${kpis.signedInr}`);
  console.log(`INFO funnel ${kpis.funnel.map((f) => `${f.label}=${f.count}`).join(", ")}; bottleneck=${kpis.bottleneck}`);
  console.log(`INFO cash scheduled ${kpis.cashScheduledInr}, collected ${kpis.cashCollectedInr}, pending ${kpis.cashPendingInr}`);

  const gates = await getGateReport(ctx);
  check("gate statuses exist", gates.statuses.length > 0, `${gates.statuses.length} gates, closing-only=${gates.closingOnly}`);
  for (const g of gates.statuses) console.log(`INFO gate ${g.gateOn} ${g.status} base=${g.baseInr} actual=${g.actualInr}`);

  const inits = await getInitiativeStatuses(ctx);
  check("five initiatives evaluated", inits.length === 5 && inits.map((i) => i.code).join() === "bet-1,bet-2,bet-3,bet-4,bet-5", inits.map((i) => i.code).join());
  for (const i of inits) console.log(`INFO ${i.code} ${i.badge}: ${i.reason}`);
  const bet5 = inits.find((i) => i.code === "bet-5");
  if (bet5?.experiment) {
    const e = bet5.experiment;
    console.log(`INFO bet-5 experiment: personalised ${e.personalised.reached}/${e.personalised.n}, template ${e.template.reached}/${e.template.n}, directional only=${e.directionalOnly}`);
  }

  const decisions = await getDecisions(ctx);
  check("decisions are raised", decisions.length > 0, `${decisions.length} decisions`);
  check("high severity is first", decisions.length > 0 && decisions[0]?.severity === "high", `first is ${decisions[0]?.id}`, true);
  const stale = decisions.find((d) => d.id === "stale-prospects");
  check("stale prospects decision names the \u20B95,00,000 deal", !!stale && stale.evidence.includes("5,00,000"));
  check("an idle coordinator decision exists", decisions.some((d) => d.id.startsWith("idle-")), "", true);
  check("a ghosting decision exists", decisions.some((d) => d.id.startsWith("ghost-")), "", true);
  for (const d of decisions) console.log(`INFO [${d.severity}] ${d.id}: ${d.title}`);

  console.log(`\nSummary: ${fails} FAIL`);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});