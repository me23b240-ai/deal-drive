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
  const { getServiceClient } = await import("../lib/db/client");
  const { getEventInfo } = await import("../lib/db/queries/events");
  const { listTeam, coordinatorsOf } = await import("../lib/db/queries/team");
  const { listOpenDeals } = await import("../lib/db/queries/crm-deals");
  const { getMouState, getDetailWithPipeline } = await import("../lib/db/queries/crm-mou");
  const { validateMou } = await import("../lib/domain/mou-template");
  const { toIstDate, todayIST } = await import("../lib/domain/bizdays");

  const view = await getServiceClient().from("v_deal_desk").select("deal_id, mou_lag_bdays, terms_status").limit(1);
  check("deal desk view has the MoU columns", !view.error, view.error?.message ?? "run 20261128b_deal_desk_view.sql");

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
    const s = await getMouState(ctx, deal.brand_id);
    check(`${m.name}: MoU state loads for ${s.brand.name}`, s.fields.brandName === s.brand.name || s.saved);
    check("blank details fail validation (GSTIN, address, signatory)", Object.keys(validateMou(s.fields)).length >= 3, Object.keys(validateMou(s.fields)).join(","));
    console.log(`INFO stage ${s.deal.stage}; send blocked: ${s.sendBlocked ?? "no"}; payment preview ${s.paymentPreview.length} rows`);
    const d = await getDetailWithPipeline(ctx, deal.brand_id);
    check("stepper facts load", d.pipeline !== undefined);
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