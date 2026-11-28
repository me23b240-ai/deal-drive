import { config } from "dotenv";
import type { Ctx } from "../lib/types";

config({ path: ".env.local" });

const EVENT = "saarang-2027";
let fails = 0;
function check(label: string, ok: boolean, detail = "", soft = false): void {
  if (!ok && !soft) fails += 1;
  console.log(`${ok ? "PASS" : soft ? "WARN" : "FAIL"} ${label}${detail ? " " + detail : ""}`);
}

async function main(): Promise<void> {
  const { getEventInfo } = await import("../lib/db/queries/events");
  const { listTeam, coordinatorsOf } = await import("../lib/db/queries/team");
  const { getDraftQueue, getComposerState } = await import("../lib/db/queries/crm-drafts");
  const { generateOpening } = await import("../lib/ai/draft");
  const { toIstDate, todayIST } = await import("../lib/domain/bizdays");

  const info = await getEventInfo(EVENT);
  if (!info) {
    console.log("FAIL no saarang-2027 event");
    process.exit(1);
  }
  const team = coordinatorsOf(await listTeam(EVENT));
  let sample: { ctx: Ctx; brandId: string } | null = null;
  for (const m of team) {
    const ctx: Ctx = {
      eventId: info.id, event: info, role: "coordinator", memberId: m.id, isCloser: m.is_closer,
      todayIst: info.as_of ? toIstDate(info.as_of) : todayIST(), isLocked: info.is_seed,
    };
    const q = await getDraftQueue(ctx);
    console.log(`INFO ${m.name}: ${q.filter((x) => x.nextStep === "initial").length} first mails, ${q.filter((x) => x.nextStep !== "initial").length} follow-ups available`);
    if (!sample && q[0]) sample = { ctx, brandId: q[0].brandId };
  }
  check("at least one company has a mail step available", sample !== null);
  if (sample) {
    const s = await getComposerState(sample.ctx, sample.brandId);
    const enabled = Object.entries(s.steps).filter(([, a]) => a.enabled).map(([k]) => k);
    check("composer state loads with an enabled step", enabled.length > 0, `${s.brand.name}: ${enabled.join(", ")}`);
  }

  if (process.env.GEMINI_API_KEY) {
    const r = await generateOpening({
      step: "follow_up_1", eventName: "Saarang", company: "Acme Foods", sector: "FMCG", channelLabel: null, contactRole: "Marketing Manager",
      notes: [], facts: [{ id: "f1", fact: "The festival draws a large student audience from colleges across the country." }], lastMailSentOn: null,
    });
    check("Gemini produced a guarded opening", r.usedAi, r.warning ?? "", true);
    console.log(`INFO model ${r.model ?? "none"}; opening: ${r.opening}`);
  } else {
    console.log("INFO GEMINI_API_KEY not set: personalised drafts will use the generic opening with a warning");
  }
  console.log(`\nSummary: ${fails} FAIL`);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});