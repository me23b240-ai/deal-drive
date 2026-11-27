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
  const { listCompanies } = await import("../lib/db/queries/crm-companies");
  const { getCompanyDetail } = await import("../lib/db/queries/crm-detail");
  const { listOpenDeals } = await import("../lib/db/queries/crm-deals");
  const { toIstDate, todayIST } = await import("../lib/domain/bizdays");

  const info = await getEventInfo(EVENT);
  if (!info) {
    console.log("FAIL no saarang-2027 event");
    process.exit(1);
  }
  const team = coordinatorsOf(await listTeam(EVENT));
  const mk = (m: { id: string; is_closer: boolean }): Ctx => ({
    eventId: info.id, event: info, role: "coordinator", memberId: m.id, isCloser: m.is_closer,
    todayIst: info.as_of ? toIstDate(info.as_of) : todayIST(), isLocked: info.is_seed,
  });

  const closer = team.find((m) => m.is_closer);
  const regular = team.find((m) => !m.is_closer);
  if (!regular) {
    console.log("FAIL no regular coordinator");
    process.exit(1);
  }
  const rctx = mk(regular);
  const page = await listCompanies(rctx, { status: "prospective" });
  const first = page.rows[0] ?? (await listCompanies(rctx, { pageSize: 1 })).rows[0];
  check("a company to inspect exists", !!first);
  if (first) {
    const d = await getCompanyDetail(rctx, first.id);
    check("detail loads with contacts and timeline", d.name === first.name, `${d.contacts.length} contacts, ${d.timeline.length} timeline items`);
    if (d.deal) console.log(`INFO deal ${d.deal.stage}, ${d.payments.length} payments`);
  }
  const mine = await listOpenDeals(rctx);
  check("regular coordinator sees only their own open deals", mine.every((x) => x.owner_id === regular.id), `${mine.length} deals`);
  if (closer) {
    const all = await listOpenDeals(mk(closer));
    check("closer sees every open deal", all.length >= mine.length, `${all.length} deals`);
  }
  console.log(`\nSummary: ${fails} FAIL`);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});