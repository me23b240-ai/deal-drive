import { config } from "dotenv";
import type { Ctx } from "../lib/types";

config({ path: ".env.local" });

const EVENT = "saarang-2027";
let fails = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (!ok) fails += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? " " + detail : ""}`);
}

async function main(): Promise<void> {
  const { getEventInfo } = await import("../lib/db/queries/events");
  const { listTeam, coordinatorsOf } = await import("../lib/db/queries/team");
  const { listOpenDeals } = await import("../lib/db/queries/crm-deals");
  const { getSlabState } = await import("../lib/db/queries/crm-slab");
  const { evaluateSlab } = await import("../lib/domain/slab");
  const { toIstDate, todayIST } = await import("../lib/domain/bizdays");

  const info = await getEventInfo(EVENT);
  if (!info) {
    console.log("FAIL no saarang-2027 event");
    process.exit(1);
  }
  let tried = false;
  for (const m of coordinatorsOf(await listTeam(EVENT))) {
    const ctx: Ctx = {
      eventId: info.id, event: info, role: "coordinator", memberId: m.id, isCloser: m.is_closer,
      todayIst: info.as_of ? toIstDate(info.as_of) : todayIST(), isLocked: info.is_seed,
    };
    const deal = (await listOpenDeals(ctx))[0];
    if (!deal) continue;
    tried = true;
    const s = await getSlabState(ctx, deal.brand_id);
    check(`${m.name}: slab state loads for ${s.brand.name}`, s.catalog.length > 0, `${s.catalog.length} catalog items, ${s.packages.length} packages, ${s.lines.length} saved lines`);
    const r = evaluateSlab({
      items: s.lines.map((l) => ({ name: l.name, qty: l.qty, unitPriceInr: l.unitPriceInr, inKind: l.inKind, isCustom: l.isCustom, priceMinInr: l.priceMinInr, soldElsewhere: l.soldElsewhere })),
      discountInr: s.discountInr, terms: s.deal.terms, today: s.today, sector: s.brand.sector, competing: s.competing, settings: s.settings,
    });
    console.log(`INFO terms ${s.deal.terms}, status ${s.deal.termsStatus}, total ${r.totalInr}, flags ${r.flags.map((f) => f.code).join(",") || "none"}, competing ${s.competing.length}`);
    break;
  }
  check("a deal was available to test", tried);
  console.log(`\nSummary: ${fails} FAIL`);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});