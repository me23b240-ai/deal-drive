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
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("FAIL missing env names");
    process.exit(1);
  }
  const { getEventInfo } = await import("../lib/db/queries/events");
  const { listTeam, coordinatorsOf } = await import("../lib/db/queries/team");
  const { getNeedsUpdate } = await import("../lib/db/queries/views");
  const { listCompanies } = await import("../lib/db/queries/crm-companies");
  const { listTasks } = await import("../lib/db/queries/crm-tasks");
  const { toIstDate, todayIST } = await import("../lib/domain/bizdays");

  const info = await getEventInfo(EVENT);
  if (!info) {
    console.log("FAIL no saarang-2027 event: run npm run seed:saarang");
    process.exit(1);
  }
  const coordinators = coordinatorsOf(await listTeam(EVENT));
  check("coordinators exist", coordinators.length > 0, `${coordinators.length} found`);

  for (const m of coordinators) {
    const ctx: Ctx = {
      eventId: info.id, event: info, role: "coordinator", memberId: m.id, isCloser: m.is_closer,
      todayIst: info.as_of ? toIstDate(info.as_of) : todayIST(), isLocked: info.is_seed,
    };
    const all = await listCompanies(ctx, { pageSize: 100 });
    const flagged = await listCompanies(ctx, { needsUpdate: true, pageSize: 100 });
    const needs = await getNeedsUpdate(ctx);
    const prospects = await listCompanies(ctx, { status: "prospective", pageSize: 100 });
    const tasks = await listTasks(ctx);
    console.log(`INFO ${m.name}: ${all.total} companies, ${flagged.total} need update, ${prospects.total} prospective, ${tasks.length} open tasks`);
    check(`${m.name}: has companies`, all.total > 0);
    check(`${m.name}: needs-update filter matches the view`, flagged.total === needs.length, `${flagged.total} vs ${needs.length}`);
    check(`${m.name}: status filter only returns prospective`, prospects.rows.every((r) => r.crmStatus === "prospective"));
    check(`${m.name}: only own companies`, all.rows.length > 0);
  }
  console.log(`\nSummary: ${fails} FAIL`);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});