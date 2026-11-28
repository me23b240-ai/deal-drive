import { randomUUID } from "node:crypto";
import { getServiceClient } from "../db/client";
import { insertChunks, wipeEvent } from "./db";
import { makeRng } from "./rng";
import {
  addBusinessDays,
  addDays,
  businessDaysBetween,
  daysBetween,
  isBusinessDay,
  todayIST,
  weekStartIST,
  type Holiday,
} from "../domain/bizdays";
import { CHANNELS, CHANNEL_LABELS, channelToInitiative, type ChannelCode } from "../domain/channels";
import { STATUS_CODES, type StatusCode } from "../domain/status";
import { DEFAULT_ASSUMPTIONS } from "../model/assumptions";
import { SAARANG_SECTORS } from "./constants/sectors";
import { COORDINATORS, HEAD, type CoordKey } from "./constants/team";
import {
  CONVERTED, HOLIDAYS, MATRIX, PROSPECTS, STALE_RULES, TEAM_GOALS,
  type FixedConverted, type FixedProspect,
} from "./constants/saarang-plan";
import { CATALOG, FACTS, PACKAGES } from "./constants/saarang-facts"; import { GATES, INITIATIVES } from "./constants/saarang-bets";

const EVENT_ID = "saarang-2027";
const IST = "+05:30";

const ACTIVE: readonly StatusCode[] = ["slabs_sent", "didnt_pick", "contacted", "ghosting", "prospective"];
const QUEUE: readonly StatusCode[] = ["to_contact", "send_mail"];
const CUR_ELIGIBLE: readonly StatusCode[] = ["slabs_sent", "didnt_pick", "contacted"];

const PREFIX = [
  "Brightleaf", "Bluecrest", "Cinder", "Driftwood", "Everpine", "Fernhill", "Goldmoor", "Harborlight", "Ironvale", "Juniper",
  "Kestrel", "Lakeshore", "Maplewood", "Nightjar", "Oakridge", "Pinecrest", "Quartzline", "Redwood", "Silverfern", "Tidewater",
  "Umberfield", "Violetta", "Willowbrook", "Yarrow", "Zinnia", "Amberline", "Birchwood", "Coppergate", "Dunmore", "Emberly",
  "Foxglove", "Glenmoor", "Hazelton", "Ivywood", "Jadeview", "Kingfisher", "Larkspur", "Mistral", "Nettle", "Orchard",
  "Peregrine", "Quillon", "Rosewell", "Saffron", "Thistle", "Upland", "Vantage", "Wrenfield", "Yewtree", "Zephyra",
  "Alder", "Bramley", "Clover", "Dapple", "Elmstead", "Flint", "Gable", "Heron",
];

const NOUNS: Record<string, string[]> = {
  food_beverage: ["Foods", "Beverages", "Pantry"],
  automotive: ["Motors", "Mobility", "Auto"],
  technology_internet: ["Labs", "Digital", "Systems"],
  banking_financial_services_insurance: ["Bank", "Finserv", "Capital"],
  fashion_beauty_lifestyle: ["Apparel", "Studio", "Beauty"],
  consumer_goods_fmcg: ["Consumer", "Home Care", "Essentials"],
  education_edtech: ["Learning", "Academy", "Edu"],
  government_psu_nonprofit: ["Foundation", "Trust", "Institute"],
  consumer_services: ["Services", "Care", "Concierge"],
  media_entertainment: ["Media", "Studios", "Entertainment"],
  healthcare_pharma_wellness: ["Wellness", "Pharma", "Health"],
  electronics_electricals: ["Electronics", "Devices", "Electricals"],
  telecom: ["Telecom", "Networks", "Connect"],
  retail_ecommerce: ["Retail", "Mart", "Bazaar"],
  travel_hospitality_leisure: ["Travels", "Hospitality", "Resorts"],
  sports: ["Sports", "Fitness", "Athletics"],
  energy_industrials_manufacturing: ["Energy", "Industries", "Works"],
  consulting_professional_services: ["Consulting", "Advisors", "Partners"],
  marketing_advertising_pr: ["Marketing", "Ads", "Communications"],
  food_qsr: ["Kitchens", "Eats", "Burgers"],
  other: ["Group", "Ventures", "Holdings"],
};

const FIRST = ["Aditya", "Ananya", "Bhavna", "Chirag", "Divya", "Esha", "Farhan", "Gauri", "Harish", "Isha", "Jayant", "Kriti", "Lakshmi", "Manav", "Neha", "Omkar", "Pooja", "Qasim", "Rhea", "Siddharth", "Tanvi", "Uday", "Vidya", "Wasim", "Yamini", "Zoya"];
const LAST = ["Agarwal", "Banerjee", "Chopra", "Desai", "Eswaran", "Fernandes", "Ghosh", "Hegde", "Iyer", "Joshi", "Kulkarni", "Lal", "Menon", "Naidu", "Oberoi", "Patel", "Quraishi", "Reddy", "Sharma", "Trivedi", "Varma", "Wadia", "Yadav", "Zacharia"];
const TITLES = ["Brand Marketing Lead", "Partnerships Manager", "Head of Marketing", "Sponsorship Manager", "Brand Manager", "Marketing Director"];
const REASONS = ["budget_exhausted", "not_relevant", "timing", "price_too_high", "no_decision_maker", "competing_event", "other"];

const HOOKS: Record<string, string> = {
  food_beverage: "the stall zone and food street at Saarang Streets",
  automotive: "the on-ground activations our past partners ran, from exhibition spaces to stunt shows",
  technology_internet: "the lounge zone and custom experience zones",
  banking_financial_services_insurance: "ticketing partnerships and the Classical and Spotlight audiences",
  fashion_beauty_lifestyle: "Panache, our fashion showcase",
  consumer_goods_fmcg: "Saarang Streets and an audience that is mostly in the 18 to 25 range",
  education_edtech: "the Spotlight Lectures and our events",
  government_psu_nonprofit: "our social campaign work",
  consumer_services: "our social campaign work and a multi-generation audience",
  media_entertainment: "the five proshow nights and our online reach",
};

const GAP: Record<string, number> = {
  slabs_sent: 0, didnt_pick: 0, contacted: 2, ghosting: 6, prospective: 5, rejected: 1, left_company: 2, wrong_number: 0, converted: 0,
};

type Step = {
  type: string;
  outcome: string;
  summary: string;
  tr?: [StatusCode, StatusCode];
  resp?: boolean;
};
type Ev = Step & { date: string; at: string };

type Co = {
  i: number;
  id: string;
  name: string;
  channel: ChannelCode;
  status: StatusCode;
  sector: string;
  tier: "large" | "medium" | "small";
  club: boolean;
  owner: CoordKey | null;
  prospect: FixedProspect | null;
  conv: FixedConverted | null;
  idle: number;
  stale: boolean;
  dL: string;
  weekOffset: number;
  attempts: number;
  viaDp: boolean;
  jitter: number;
  reason: string | null;
  followUp: string | null;
  createdAt: string;
  ev: Ev[];
  contactIds: string[];
};

export type SaarangReport = {
  eventId: string;
  anchor: string;
  base: string;
  statusCounts: Record<string, number>;
  counts: Record<string, number>;
  fixedLastTouch: number;
};

const hhmm = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;
const ts = (date: string, seq: number, jitter: number): string => `${date}T${hhmm(600 + seq * 20 + jitter)}${IST}`;
const pretty = (s: string): string => s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
const plain = (name: string): string => name.replace(" (demo)", "");

export async function seedSaarang(anchorArg?: string): Promise<SaarangReport> {
  if (anchorArg && !/^\d{4}-\d{2}-\d{2}$/.test(anchorArg)) throw new Error("--anchor must be YYYY-MM-DD");
  const anchor = anchorArg ?? todayIST();
  const HOL: Holiday[] = HOLIDAYS.map((h) => ({ day: h.day }));
  const snapBack = (iso: string): string => {
    let d = iso;
    while (!isBusinessDay(d, HOL)) d = addDays(d, -1);
    return d;
  };
  const subB = (iso: string, n: number): string => {
    let d = iso;
    let left = n;
    while (left > 0) {
      d = addDays(d, -1);
      if (isBusinessDay(d, HOL)) left -= 1;
    }
    return d;
  };
  const base = snapBack(anchor);
  const monday = (offset: number): string => addDays(weekStartIST(base), -7 * offset);
  const campStart = monday(5);
  const rng = makeRng(20270106);
  const keys = COORDINATORS.map((c) => c.key);

  // ---- 1. companies from the matrix
  const cos: Co[] = [];
  for (const channel of CHANNELS) {
    for (const status of STATUS_CODES) {
      const n = MATRIX[channel][status] ?? 0;
      for (let k = 0; k < n; k++) {
        cos.push({
          i: cos.length, id: randomUUID(), name: "", channel, status, sector: "", tier: "medium", club: false,
          owner: null, prospect: null, conv: null, idle: -1, stale: false, dL: base, weekOffset: -1,
          attempts: 0, viaDp: false, jitter: rng.int(0, 9), reason: null, followUp: null, createdAt: "", ev: [], contactIds: [],
        });
      }
    }
  }
  if (cos.length !== 220) throw new Error(`matrix gives ${cos.length} companies, expected 220`);

  // ---- 2. fixed prospects and converted
  const used = new Set<string>();
  for (const p of PROSPECTS) {
    const c = cos.find((x) => x.channel === p.channel && x.status === "prospective" && !x.prospect);
    if (!c) throw new Error(`no slot for prospect ${p.name}`);
    c.prospect = p;
    c.name = p.name;
    c.sector = p.sector;
    c.owner = p.owner;
    used.add(p.name);
  }
  for (const v of CONVERTED) {
    const c = cos.find((x) => x.channel === v.channel && x.status === "converted" && !x.conv);
    if (!c) throw new Error(`no slot for converted ${v.name}`);
    c.conv = v;
    c.name = v.name;
    c.sector = v.sector;
    c.owner = v.owner;
    used.add(v.name);
  }

  // ---- 3. names, sectors, tiers
  const sectorCycle = rng.shuffle([...SAARANG_SECTORS]);
  let sc = 0;
  for (const c of cos) {
    if (!c.sector) c.sector = sectorCycle[sc++ % sectorCycle.length];
    if (!c.name) {
      let name = "";
      for (let t = 0; t < 300 && !name; t++) {
        const n = `${rng.pick(PREFIX)} ${rng.pick(NOUNS[c.sector] ?? NOUNS.other)} (demo)`;
        if (!used.has(n)) name = n;
      }
      if (!name) name = `Demo Company ${c.i} (demo)`;
      used.add(name);
      c.name = name;
    }
    const amount = c.prospect?.amount ?? c.conv?.total;
    if (amount !== undefined) c.tier = amount >= 300000 ? "large" : amount >= 150000 ? "medium" : "small";
    else c.tier = rng.weighted(["large", "medium", "small"] as const, [0.25, 0.4, 0.35]);
    c.club = c.tier === "small" && rng.chance(0.6);
  }

  // ---- 4. owners
  const owned = new Map<CoordKey, number>(keys.map((k) => [k, 0]));
  const give = (c: Co, k: CoordKey): void => {
    c.owner = k;
    owned.set(k, (owned.get(k) ?? 0) + 1);
  };
  for (const c of cos) if (c.owner) owned.set(c.owner, (owned.get(c.owner) ?? 0) + 1);

  const ishitaPool = rng.shuffle(cos.filter((c) => !c.owner && CUR_ELIGIBLE.includes(c.status)));
  for (const c of ishitaPool.slice(0, 11)) give(c, "ishita");

  const ghosts = rng.shuffle(cos.filter((c) => c.status === "ghosting"));
  const ghostOwners: CoordKey[] = ["rohan", "rohan", "rohan", "rohan", "rohan", "rohan", "rohan", "rohan", "aarav", "ishita", "kavya", "dev", "sanjana", "arjun"];
  ghosts.forEach((c, k) => give(c, ghostOwners[k]));

  for (const c of rng.shuffle(cos.filter((x) => !x.owner))) {
    const min = Math.min(...keys.map((k) => owned.get(k) ?? 0));
    give(c, rng.pick(keys.filter((k) => (owned.get(k) ?? 0) === min)));
  }

  // ---- 5. two ownership conflicts (same company under two owners)
  const others: CoordKey[] = ["aarav", "kavya", "dev", "sanjana", "arjun"];
  const makePair = (a: Co | undefined, b: Co | undefined): void => {
    if (!a || !b) return;
    b.name = `${plain(a.name)} Ltd (demo)`;
    used.add(b.name);
    if (b.owner === a.owner) b.owner = rng.pick(others.filter((k) => k !== a.owner));
  };
  const okOwner = (c: Co): boolean => c.owner !== "ishita" && c.owner !== "rohan";
  makePair(
    cos.find((c) => c.status === "slabs_sent" && c.channel === "past_sponsors" && okOwner(c)),
    cos.find((c) => c.status === "slabs_sent" && c.channel === "other_fest" && okOwner(c)),
  );
  makePair(
    cos.find((c) => c.status === "slabs_sent" && c.channel === "cold_database" && okOwner(c)),
    cos.find((c) => (c.status === "slabs_sent" || c.status === "contacted") && c.channel === "new_local" && okOwner(c)),
  );

  const own = (c: Co): CoordKey => c.owner as CoordKey;

  // ---- 6. idle business days and stale flags
  let ishitaTc = 0;
  for (const c of cos) if (c.prospect) { c.idle = c.prospect.idle; c.stale = c.idle >= 5; }
  for (const c of cos) {
    if (!c.conv) continue;
    c.dL = snapBack(addDays(base, -c.conv.daysAgo));
    c.idle = businessDaysBetween(c.dL, base, HOL);
  }
  for (const c of cos) {
    if (c.idle >= 0 || c.owner !== "ishita") continue;
    if (ACTIVE.includes(c.status)) { c.idle = rng.int(6, 9); c.stale = true; }
    else if (c.status === "to_contact") { if (ishitaTc < 4) { ishitaTc += 1; c.idle = rng.int(7, 9); c.stale = true; } else c.idle = rng.int(0, 4); }
    else if (c.status === "send_mail") { c.idle = rng.int(2, 3); c.stale = true; }
    else c.idle = rng.int(8, 20);
  }
  let rohanSeen = 0;
  for (const c of cos) {
    if (c.idle >= 0 || c.status !== "ghosting") continue;
    if (c.owner === "rohan") {
      rohanSeen += 1;
      if (rohanSeen <= 4) { c.idle = rng.int(6, 8); c.stale = true; } else c.idle = rng.int(1, 3);
    } else c.idle = rng.int(1, 4);
  }
  const extra = rng.shuffle(cos.filter((c) => c.idle < 0 && c.owner !== "ishita" && CUR_ELIGIBLE.includes(c.status))).slice(0, 6);
  for (const c of extra) { c.idle = (STALE_RULES[c.status] ?? 3) + rng.int(2, 4); c.stale = true; }

  let staleTc = cos.filter((c) => c.status === "to_contact" && c.stale).length;
  for (const c of rng.shuffle(cos.filter((x) => x.status === "to_contact" && x.idle < 0))) {
    if (staleTc < 6) { c.idle = rng.int(7, 9); c.stale = true; staleTc += 1; } else c.idle = rng.int(0, 4);
  }
  let staleSm = cos.filter((c) => c.status === "send_mail" && c.stale).length;
  for (const c of rng.shuffle(cos.filter((x) => x.status === "send_mail" && x.idle < 0))) {
    if (staleSm < 3) { c.idle = rng.int(2, 3); c.stale = true; staleSm += 1; } else c.idle = 0;
  }
  for (const c of cos) {
    if (c.idle >= 0) continue;
    if (c.status === "rejected") c.idle = rng.int(2, 18);
    else if (c.status === "left_company") c.idle = rng.int(4, 16);
    else if (c.status === "wrong_number") c.idle = rng.int(3, 15);
    else c.idle = rng.int(0, 2);
  }
  for (const c of cos) if (!c.conv) c.dL = subB(base, c.idle);

  // ---- 7. week plan, attempts, rejection reasons
  const startOfCurrent = monday(0);
  const currentTarget: Record<CoordKey, number> = { aarav: 9, ishita: 0, rohan: 7, kavya: 9, dev: 8, sanjana: 10, arjun: 6 };
  for (const k of keys) {
    const pool = rng.shuffle(
      cos.filter((c) => c.owner === k && !c.stale && CUR_ELIGIBLE.includes(c.status) && c.dL >= startOfCurrent && c.dL <= base),
    );
    for (const c of pool.slice(0, currentTarget[k])) c.weekOffset = 0;
  }
  for (const c of cos) {
    if (QUEUE.includes(c.status) || c.weekOffset === 0) continue;
    const late = c.owner === "ishita" || c.status === "ghosting" || c.status === "prospective" || c.status === "converted";
    c.weekOffset = late
      ? rng.weighted([2, 3, 4, 5], [0.27, 0.19, 0.13, 0.09])
      : rng.weighted([1, 2, 3, 4, 5], [0.32, 0.27, 0.19, 0.13, 0.09]);
  }
  for (const c of cos) {
    c.viaDp = c.status === "contacted" && rng.chance(0.25);
    if (c.status === "didnt_pick") c.attempts = c.weekOffset > 0 ? rng.int(2, 3) : rng.int(1, 2);
    else if (c.status === "wrong_number" || c.viaDp) c.attempts = 1;
    if (c.status === "rejected") {
      c.reason = c.channel === "cold_database"
        ? rng.weighted(REASONS, [1, 4, 2, 1, 4, 0, 1])
        : rng.weighted(REASONS, [3, 2, 3, 3, 1, 2, 1]);
    }
  }

  // ---- 8. timelines
  const MAIL: Step = { type: "mail_sent", outcome: "sent", summary: "First mail with proposal and slabs sent", tr: ["to_contact", "slabs_sent"] };
  const fu = (n: number, extraStep?: Partial<Step>): Step => ({ type: "follow_up", outcome: "sent", summary: `Follow-up ${n} sent`, ...extraStep });
  const stepsFor = (c: Co, D: number): Step[] => {
    switch (c.status) {
      case "slabs_sent":
        return D > 0 ? [MAIL, fu(1)] : [MAIL];
      case "didnt_pick":
        return Array.from({ length: c.attempts }, (_, i): Step => ({
          type: "call_attempt", outcome: "no_answer", summary: `Call, no answer (attempt ${i + 1})`,
          ...(i === 0 ? { tr: ["to_contact", "didnt_pick"] as [StatusCode, StatusCode] } : {}),
        }));
      case "contacted": {
        const head: Step[] = c.viaDp
          ? [
              { type: "call_attempt", outcome: "no_answer", summary: "Call, no answer (attempt 1)", tr: ["to_contact", "didnt_pick"] },
              { type: "note", outcome: "picked_up", summary: "Picked up on retry, proposal and slabs shared", tr: ["didnt_pick", "contacted"], resp: true },
            ]
          : [MAIL, { type: "replied", outcome: "neutral", summary: "Contact replied and asked for details", tr: ["slabs_sent", "contacted"], resp: true }];
        return D >= 2 ? [...head, fu(1)] : head;
      }
      case "ghosting":
        return [
          MAIL,
          { type: "replied", outcome: "neutral", summary: "Contact replied and asked for details", tr: ["slabs_sent", "contacted"], resp: true },
          fu(1, { summary: "No reply to follow-up", tr: ["contacted", "ghosting"] }),
          fu(2, { summary: "Second nudge, no reply" }),
        ];
      case "prospective":
        return [
          MAIL,
          { type: "replied", outcome: "positive", summary: "Contact replied with interest", tr: ["slabs_sent", "contacted"], resp: true },
          { type: "note", outcome: "interested", summary: "Interested, discussing a custom slab", tr: ["contacted", "prospective"] },
          fu(1, { summary: "Shared next steps on the custom slab" }),
        ];
      case "converted":
        return [
          MAIL,
          { type: "replied", outcome: "positive", summary: "Contact replied with interest", tr: ["slabs_sent", "contacted"], resp: true },
          { type: "note", outcome: "interested", summary: "Interested, discussing a custom slab", tr: ["contacted", "prospective"] },
          fu(1, { summary: "Custom slab and MoU draft shared" }),
          { type: "note", outcome: "confirmed", summary: "Confirmed. MoU signed.", tr: ["prospective", "converted"] },
        ];
      case "rejected":
        return [
          MAIL,
          { type: "replied", outcome: "not_interested", summary: `Declined: ${(c.reason ?? "other").replace(/_/g, " ")}`, tr: ["slabs_sent", "rejected"], resp: true },
        ];
      case "left_company":
        return [MAIL, { type: "note", outcome: "bad_contact", summary: "Contact has left the company", tr: ["slabs_sent", "left_company"] }];
      case "wrong_number":
        return [{ type: "call_attempt", outcome: "wrong_number", summary: "Wrong number", tr: ["to_contact", "wrong_number"] }];
      default:
        return [];
    }
  };

  const drawDay = (offset: number): string => {
    const days = [0, 1, 2, 3, 4].map((n) => addDays(monday(offset), n)).filter((d) => isBusinessDay(d, HOL) && d <= base);
    return rng.pick(days.length ? days : [base]);
  };

  const statusEvents: Record<string, unknown>[] = [];
  const firstOutreach = new Map<string, string>();
  const firstResponse = new Map<string, string>();
  const lastTouch = new Map<string, string>();
  const lastChange = new Map<string, string>();

  for (const c of cos) {
    if (QUEUE.includes(c.status)) {
      c.createdAt = ts(c.dL, 0, c.jitter);
      lastTouch.set(c.id, c.status === "send_mail" ? ts(c.dL, 1, c.jitter) : c.createdAt);
      lastChange.set(c.id, lastTouch.get(c.id) as string);
      if (c.status === "send_mail") {
        statusEvents.push({
          id: randomUUID(), event_id: EVENT_ID, brand_id: c.id, owner_id: null, from_status: "to_contact",
          to_status: "send_mail", note: "Draft queued", occurred_at: ts(c.dL, 1, c.jitter), __owner: c.owner,
        });
      }
      continue;
    }
    let d0 = drawDay(c.weekOffset);
    const gapB = c.weekOffset === 0 ? 0 : GAP[c.status] ?? 0;
    const maxD0 = c.conv ? snapBack(addDays(c.dL, -rng.int(14, 25))) : subB(c.dL, gapB);
    if (d0 > maxD0) d0 = maxD0;
    if (d0 < campStart) d0 = campStart;
    if (d0 > c.dL) d0 = c.dL;
    const steps = stepsFor(c, daysBetween(d0, c.dL));
    if (steps.length === 1) d0 = c.dL;
    const D = daysBetween(d0, c.dL);
    const dates = steps.map((_, i) => (steps.length === 1 ? c.dL : snapBack(addDays(d0, Math.round((D * i) / (steps.length - 1))))));
    const seen = new Map<string, number>();
    c.ev = steps.map((s, i) => {
      const q = seen.get(dates[i]) ?? 0;
      seen.set(dates[i], q + 1);
      return { ...s, date: dates[i], at: ts(dates[i], q, c.jitter) };
    });
    c.createdAt = ts(subB(d0, rng.int(1, 3)), 0, 0);
    firstOutreach.set(c.id, c.ev[0].at);
    const resp = c.ev.find((e) => e.resp);
    if (resp) firstResponse.set(c.id, resp.at);
    lastTouch.set(c.id, c.ev[c.ev.length - 1].at);
    for (const e of c.ev) {
      if (!e.tr) continue;
      lastChange.set(c.id, e.at);
      statusEvents.push({
        id: randomUUID(), event_id: EVENT_ID, brand_id: c.id, owner_id: null, from_status: e.tr[0],
        to_status: e.tr[1], note: e.summary, occurred_at: e.at, __owner: c.owner,
      });
    }
  }

  // ---- follow-up dates
  for (const c of cos) {
    if (c.status === "to_contact" || ["converted", "rejected", "left_company", "wrong_number"].includes(c.status)) c.followUp = null;
    else if (c.stale) c.followUp = c.idle >= 3 && rng.chance(0.4) ? subB(base, rng.int(1, c.idle - 1)) : null;
    else c.followUp = c.status === "send_mail" ? addBusinessDays(base, 1) : addBusinessDays(base, rng.int(1, 4));
  }

  // ---- 9. drafts
  const unresp = rng.shuffle(cos.filter((c) => c.status === "slabs_sent" || c.status === "left_company"));
  const resp = rng.shuffle(
    cos.filter((c) => ["contacted", "prospective", "converted", "rejected", "ghosting"].includes(c.status) && !c.viaDp),
  );
  const draftOf = new Map<number, { id: string; personalised: boolean }>();
  const addDraft = (c: Co, personalised: boolean): void => { draftOf.set(c.i, { id: randomUUID(), personalised }); };
  unresp.slice(0, 14).forEach((c) => addDraft(c, true));
  resp.slice(0, 6).forEach((c) => addDraft(c, true));
  unresp.slice(14, 31).forEach((c) => addDraft(c, false));
  resp.slice(6, 9).forEach((c) => addDraft(c, false));
  const pending = rng.shuffle(cos.filter((c) => c.status === "send_mail")).slice(0, 6);

  // ---- 10. build rows
  const teamIds = new Map<string, string>();
  teamIds.set("head", randomUUID());
  for (const m of COORDINATORS) teamIds.set(m.key, randomUUID());
  const ownerId = (c: Co): string => teamIds.get(own(c)) as string;

  const sb = getServiceClient();
  await wipeEvent(EVENT_ID);
  const { error: evErr } = await sb.from("events").upsert(
    {
      id: EVENT_ID, name: "Saarang 2027 (live demo, simulated)", starts_at: "2027-01-06T09:00:00+05:30",
      ends_at: "2027-01-10T23:00:00+05:30", currency: "INR", is_seed: false, as_of: null,
      weekly_target_default: 10, model_assumptions: DEFAULT_ASSUMPTIONS,
    },
    { onConflict: "id" },
  );
  if (evErr) throw new Error(`events: ${evErr.message}`);

  await insertChunks("team_members", [
    { id: teamIds.get("head"), event_id: EVENT_ID, source_id: HEAD.sourceId, name: HEAD.name, role: "manager", is_closer: false },
    ...COORDINATORS.map((m) => ({
      id: teamIds.get(m.key), event_id: EVENT_ID, source_id: `demo-${m.key}`, name: m.name, role: "member", is_closer: m.closer,
    })),
  ]);

  const channelCampaign = new Map<string, string>();
  const initiativeCampaign = new Map<string, string>();
  const campaignRows: Record<string, unknown>[] = [];
  for (const ch of CHANNELS) {
    const id = randomUUID();
    channelCampaign.set(ch, id);
    campaignRows.push({
      id, event_id: EVENT_ID, source_id: ch, name: CHANNEL_LABELS[ch], channel: "other", objective: "Lead source tag",
      audience: CHANNEL_LABELS[ch], owner_id: teamIds.get("head"), budget_inr: 0, spend_inr: 0, kind: "channel",
    });
  }
  for (const b of INITIATIVES) {
    const id = randomUUID();
    initiativeCampaign.set(b.code, id);
    campaignRows.push({
      id, event_id: EVENT_ID, source_id: b.code, name: b.name, channel: "other", objective: b.concept, audience: "Saarang 2027 sponsors",
      owner_id: teamIds.get(b.owner), planned_start: `${b.start}T09:00:00${IST}`, planned_end: `${b.end}T18:00:00${IST}`,
      budget_inr: b.budget, spend_inr: b.spend, kind: "initiative", concept: b.concept, kpis: b.kpis,
      scale_rule: b.scale, change_rule: b.change, stop_rule: b.stop, expected_stretch_cash_inr: b.expected,
    });
  }
  await insertChunks("campaigns", campaignRows);

  const qual = (c: Co): string => {
    if (c.status === "prospective" || c.status === "converted") return "qualified";
    if (c.status === "rejected") return "unqualified";
    if (["contacted", "ghosting"].includes(c.status)) return "engaged";
    return "unreviewed";
  };

  await insertChunks(
    "brands",
    cos.map((c) => ({
      id: c.id, event_id: EVENT_ID, source_id: `sg27-b-${c.i + 1}`, name: c.name, industry: pretty(c.sector),
      owner_id: ownerId(c), qualification: qual(c), created_at: c.createdAt, crm_status: c.status,
      source_channel: c.channel, company_tier: c.tier, is_club_deal: c.club, sector: c.sector,
      call_attempts: c.attempts, approx_amount_inr: c.prospect?.amount ?? c.conv?.total ?? null,
      final_amount_inr: c.conv?.total ?? null, final_in_kind_inr: c.conv?.inKind ?? 0,
      rejection_reason: c.reason, next_follow_up: c.followUp,
      first_outreach_at: firstOutreach.get(c.id) ?? null, first_response_at: firstResponse.get(c.id) ?? null,
      last_status_change_at: lastChange.get(c.id) ?? c.createdAt, last_touch_at: lastTouch.get(c.id) ?? c.createdAt,
      initiative_id: initiativeCampaign.get(channelToInitiative(c.channel)) ?? null,
    })),
  );

  const contactRows: Record<string, unknown>[] = [];
  let cn = 0;
  for (const c of cos) {
    const n = rng.chance(0.4) ? 2 : 1;
    const slug = plain(c.name).toLowerCase().replace(/[^a-z0-9]+/g, "");
    for (let k = 0; k < n; k++) {
      const first = rng.pick(FIRST);
      const last = rng.pick(LAST);
      const id = randomUUID();
      c.contactIds.push(id);
      cn += 1;
      contactRows.push({
        id, brand_id: c.id, source_id: `sg27-c-${cn}`, name: `${first} ${last}`, job_title: rng.pick(TITLES),
        email: `${first}.${last}@${slug}.example.com`.toLowerCase(), linkedin_url: null,
        phone: `90000${rng.int(10000, 99999)}`, created_at: c.createdAt,
      });
    }
  }
  await insertChunks("contacts", contactRows);

  // drafts
  const draftRows: Record<string, unknown>[] = [];
  const opening = (c: Co): string =>
    `Hello team, ${plain(c.name)} looks like a natural fit for ${HOOKS[c.sector] ?? "our five proshow nights and a young audience"} at Saarang 2027.`;
  const draftRow = (c: Co, id: string, personalised: boolean, sent: string | null): Record<string, unknown> => ({
    id, event_id: EVENT_ID, brand_id: c.id, contact_id: c.contactIds[0], campaign_id: channelCampaign.get(c.channel),
    owner_id: ownerId(c), subject: `Saarang 2027 x ${plain(c.name)}: partnership opportunity`,
    opening_paragraph: personalised ? opening(c) : null,
    body_html: `<p>${personalised ? opening(c) : "Hello team,"}</p><p>Standard Saarang 2027 proposal mail (simulated).</p>`,
    personalised, inputs: { sector: c.sector, channel: c.channel, simulated: true },
    model: personalised ? "gemini-2.5-flash" : null, status: sent ? "sent" : "draft",
    created_at: sent ?? c.createdAt, sent_at: sent, sequence_step: "initial", template_version: "2027-lineup",
  });
  for (const c of cos) {
    const d = draftOf.get(c.i);
    if (!d) continue;
    const mail = c.ev.find((e) => e.type === "mail_sent");
    draftRows.push(draftRow(c, d.id, d.personalised, mail ? mail.at : null));
  }
  pending.forEach((c, k) => draftRows.push(draftRow(c, randomUUID(), k % 2 === 0, null)));
  await insertChunks("email_drafts", draftRows);

  // activities
  const actRows: Record<string, unknown>[] = [];
  let an = 0;
  for (const c of cos) {
    const d = draftOf.get(c.i);
    for (const e of c.ev) {
      const linked = d && (e.type === "mail_sent" || e.type === "replied");
      an += 1;
      actRows.push({
        id: randomUUID(), event_id: EVENT_ID, source_id: `sg27-a-${an}`, brand_id: c.id, contact_id: c.contactIds[0],
        campaign_id: channelCampaign.get(c.channel), owner_id: ownerId(c), event_type: e.type, outcome: e.outcome,
        summary: e.summary, email_draft_id: linked ? d.id : null, personalised: linked ? d.personalised : false,
        occurred_at: e.at,
      });
    }
  }
  await insertChunks("activities", actRows);

  await insertChunks(
    "status_events",
    statusEvents.map((r) => {
      const { __owner, ...row } = r as Record<string, unknown> & { __owner: CoordKey | null };
      return { ...row, owner_id: __owner ? teamIds.get(__owner) : null };
    }),
  );

  // deals, history, payments
  const dealRows: Record<string, unknown>[] = [];
  const histRows: Record<string, unknown>[] = [];
  const payRows: Record<string, unknown>[] = [];
  let hn = 0;
  const hist = (dealId: string, c: Co, stage: string, proposed: number, signed: number, at: string): void => {
    hn += 1;
    histRows.push({
      id: randomUUID(), source_id: `sg27-dh-${hn}`, deal_id: dealId, stage, proposed_value_inr: proposed,
      signed_value_inr: signed, owner_id: ownerId(c), effective_at: at,
    });
  };
  const A = DEFAULT_ASSUMPTIONS;
  for (const c of cos) {
    if (c.status !== "prospective" && c.status !== "converted") continue;
    const dealId = randomUUID();
    const proAt = (c.ev.find((e) => e.tr && e.tr[1] === "prospective") as Ev).at;
    const last = c.ev[c.ev.length - 1];
    if (c.prospect) {
      dealRows.push({
        id: dealId, event_id: EVENT_ID, source_id: `sg27-d-${c.i + 1}`, brand_id: c.id, primary_contact_id: c.contactIds[0],
        campaign_id: channelCampaign.get(c.channel), owner_id: ownerId(c), name: `${plain(c.name)} festival partnership`,
        support_type: "cash", stage: c.prospect.stage, proposed_value_inr: c.prospect.amount, signed_value_inr: 0,
        signed_cash_inr: 0, signed_in_kind_inr: 0, stage_changed_at: last.at, next_follow_up: c.followUp, created_at: proAt, payment_terms: "75_25",
      });
      hist(dealId, c, "prospecting", c.prospect.amount, 0, proAt);
      if (c.prospect.stage !== "prospecting") hist(dealId, c, c.prospect.stage, c.prospect.amount, 0, last.at);
    } else if (c.conv) {
      const v = c.conv;
      const cash = v.total - v.inKind;
      const pre = Math.round(cash * 0.75);
      const confirmDate = last.date;
      dealRows.push({
        id: dealId, event_id: EVENT_ID, source_id: `sg27-d-${c.i + 1}`, brand_id: c.id, primary_contact_id: c.contactIds[0],
        campaign_id: channelCampaign.get(c.channel), owner_id: ownerId(c), name: `${plain(c.name)} festival partnership`,
        support_type: "cash", stage: "partner_confirmed", proposed_value_inr: v.total, signed_value_inr: v.total,
        signed_cash_inr: cash, signed_in_kind_inr: v.inKind, stage_changed_at: last.at, next_follow_up: null,
        created_at: proAt, payment_terms: "75_25", mou_signed_at: confirmDate,
        invoice_sent_at: v.received ? addDays(confirmDate, 2) : null,
      });
      hist(dealId, c, "prospecting", v.total, 0, proAt);
      hist(dealId, c, "proposal_sent", v.total, 0, c.ev[3].at);
      hist(dealId, c, "partner_confirmed", v.total, v.total, last.at);
      const receivedAt = v.received ? ts(subB(base, rng.int(1, 3)), 4, 0) : null;
      payRows.push(
        { id: randomUUID(), deal_id: dealId, amount_inr: pre, due_date: A.prefest_due_date, received_at: receivedAt, note: "75% pre-fest", phase: "pre_fest" },
        { id: randomUUID(), deal_id: dealId, amount_inr: cash - pre, due_date: A.postfest_due_date, received_at: null, note: "25% post-fest", phase: "post_fest" },
      );
    }
  }
  await insertChunks("deals", dealRows);
  await insertChunks("deal_history", histRows);
  await insertChunks("payments", payRows);

  // tasks and EOD reports
  const taskRows: Record<string, unknown>[] = [];
  for (const m of COORDINATORS) {
    const mine = rng.shuffle(cos.filter((c) => c.owner === m.key && ACTIVE.includes(c.status)));
    const oid = teamIds.get(m.key);
    mine.slice(0, 2).forEach((c) => {
      taskRows.push({
        id: randomUUID(), event_id: EVENT_ID, title: `Follow up with ${plain(c.name)}`, description: "Check status and agree the next step.",
        owner_id: oid, brand_id: c.id, due_date: m.key === "ishita" ? subB(base, 2) : addBusinessDays(base, rng.int(0, 3)),
        status: "todo", source: "manual", created_at: ts(subB(base, 3), 2, 0), created_by: oid,
      });
    });
    const done = mine[2];
    if (done) {
      taskRows.push({
        id: randomUUID(), event_id: EVENT_ID, title: `Send slabs mail to ${plain(done.name)}`, description: null, owner_id: oid,
        brand_id: done.id, due_date: subB(base, 1), status: "done", source: "manual", created_at: ts(subB(base, 4), 2, 0),
        completed_at: ts(subB(base, 1), 3, 0), created_by: oid,
      });
    }
  }
  await insertChunks("tasks", taskRows);

  const eodRows: Record<string, unknown>[] = [];
  const NOTES = ["Steady day, two replies waiting on decision makers.", "Mostly follow-ups; one slab call booked.", "Slow replies today, will retry tomorrow.", "Sent the planned mails and logged all calls."];
  for (const m of COORDINATORS) {
    for (let k = 1; k <= 5; k++) {
      if (m.key === "ishita" && k <= 3) continue;
      const date = subB(base, k);
      eodRows.push({
        id: randomUUID(), member_id: teamIds.get(m.key), report_date: date,
        auto_summary: { mails_sent: rng.int(1, 5), calls: rng.int(2, 8), status_changes: rng.int(1, 4), tasks_done: rng.int(0, 2), still_needing_update: rng.int(0, 5) },
        note: rng.pick(NOTES), submitted_at: `${date}T18:${String(rng.int(0, 40)).padStart(2, "0")}:00${IST}`,
      });
    }
  }
  await insertChunks("eod_reports", eodRows);

  // targets, settings, catalog
  const RAMP = [10, 6, 5, 4, 3, 2];
  const weeklyRows: Record<string, unknown>[] = [];
  for (const m of COORDINATORS) {
    for (let off = 0; off <= 5; off++) {
      weeklyRows.push({
        id: randomUUID(), event_id: EVENT_ID, member_id: teamIds.get(m.key), week_start: monday(off),
        target_outreach: RAMP[off], label: off === 0 ? "sprint" : "normal", mix: null,
      });
    }
  }
  await insertChunks("weekly_targets", weeklyRows);
  await insertChunks(
    "targets",
    TEAM_GOALS.map((g) => ({
      id: randomUUID(), event_id: EVENT_ID, version_label: g.label, effective_at: `${base}T09:00:00${IST}`,
      qualified_brands_goal: g.qualified, confirmed_partnerships_goal: g.partnerships,
      signed_value_goal_inr: g.signed, cash_collected_goal_inr: g.cash, scenario: g.scenario,
    })),
  );
  await insertChunks("stale_rules", Object.entries(STALE_RULES).map(([state_key, days_threshold]) => ({ event_id: EVENT_ID, state_key, days_threshold })));
  await insertChunks("holidays", HOLIDAYS.map((h) => ({ event_id: EVENT_ID, day: h.day, name: h.name })));
  await insertChunks("portfolio_gates", GATES.map(([gate_date, base_signed_inr, stretch_signed_inr]) => ({ event_id: EVENT_ID, gate_date, base_signed_inr, stretch_signed_inr })));
  await insertChunks(
    "packages",
    PACKAGES.map((p, k) => ({
      id: randomUUID(), event_id: EVENT_ID, name: p.name, price_inr: p.price, tier_order: k + 1, headline: p.headline,
      deliverables: p.headline.split(" + "),
    })),
  );
  await insertChunks(
    "deliverable_catalog",
    CATALOG.map(([category, name, min, max]) => ({
      id: randomUUID(), event_id: EVENT_ID, category, name, price_min_inr: min, price_max_inr: max,
      tier: category.startsWith("Club Tier") ? category.replace("Club ", "").toLowerCase().replace(" ", "_") : null,
      sold: category.startsWith("Club") ? rng.chance(0.35) : false, sold_to: null,
    })),
  );
  await insertChunks(
    "fact_bank",
    FACTS.map((f) => ({
      id: randomUUID(), event_id: EVENT_ID, category: f.category, fact: f.fact, source: f.source, source_year: f.year,
      sector_tags: f.tags, needs_review: f.review, is_active: true,
    })),
  );

  // ---- 11. make sure database triggers did not move last_touch_at
  const expected = new Map(cos.map((c) => [c.id, lastTouch.get(c.id) ?? c.createdAt]));
  const wrong: { id: string; at: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("brands").select("id, last_touch_at").eq("event_id", EVENT_ID).range(from, from + 999);
    if (error) throw new Error(`brands: ${error.message}`);
    for (const r of data ?? []) {
      const want = expected.get(String(r.id));
      if (want && Date.parse(String(r.last_touch_at)) !== Date.parse(want)) wrong.push({ id: String(r.id), at: want });
    }
    if (!data || data.length < 1000) break;
  }
  for (let i = 0; i < wrong.length; i += 20) {
    await Promise.all(wrong.slice(i, i + 20).map(async (w) => {
      const { error } = await sb.from("brands").update({ last_touch_at: w.at }).eq("id", w.id);
      if (error) throw new Error(`brands update: ${error.message}`);
    }));
  }

  const statusCounts: Record<string, number> = {};
  for (const c of cos) statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
  return {
    eventId: EVENT_ID, anchor, base, statusCounts, fixedLastTouch: wrong.length,
    counts: {
      team_members: COORDINATORS.length + 1, campaigns: campaignRows.length, brands: cos.length, contacts: contactRows.length,
      email_drafts: draftRows.length, activities: actRows.length, status_events: statusEvents.length, deals: dealRows.length,
      deal_history: histRows.length, payments: payRows.length, tasks: taskRows.length, eod_reports: eodRows.length,
      weekly_targets: weeklyRows.length, fact_bank: FACTS.length, packages: PACKAGES.length, deliverable_catalog: CATALOG.length,
    },
  };
}