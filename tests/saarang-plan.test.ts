import { describe, expect, it } from "vitest";
import { CHANNELS, WARM_CHANNELS } from "@/lib/domain/channels";
import { STATUS_CODES } from "@/lib/domain/status";
import { CONVERTED, MATRIX, PROSPECTS } from "@/lib/seed/constants/saarang-plan";

const statusTotal = (s: (typeof STATUS_CODES)[number]) => CHANNELS.reduce((t, c) => t + (MATRIX[c][s] ?? 0), 0);
const channelTotal = (c: (typeof CHANNELS)[number]) => STATUS_CODES.reduce((t, s) => t + (MATRIX[c][s] ?? 0), 0);

describe("saarang plan constants", () => {
  it("has the exact status counts", () => {
    const want = { to_contact: 55, send_mail: 12, slabs_sent: 28, didnt_pick: 14, contacted: 30, ghosting: 14, prospective: 14, converted: 4, rejected: 42, left_company: 4, wrong_number: 3 };
    for (const s of STATUS_CODES) expect(statusTotal(s)).toBe(want[s]);
  });

  it("has the exact channel totals and 220 companies", () => {
    const want = { cold_database: 65, past_sponsors: 30, other_fest: 30, agency: 20, new_local: 20, artist_linked: 15, csr: 12, inbound_referral: 10, ipl_sports: 10, institute: 8 };
    for (const c of CHANNELS) expect(channelTotal(c)).toBe(want[c]);
    expect(CHANNELS.reduce((t, c) => t + channelTotal(c), 0)).toBe(220);
  });

  it("splits the queue 25 warm and 42 other, with no artist-linked in the queue", () => {
    const q = (c: (typeof CHANNELS)[number]) => (MATRIX[c].to_contact ?? 0) + (MATRIX[c].send_mail ?? 0);
    expect(CHANNELS.filter((c) => WARM_CHANNELS.has(c)).reduce((t, c) => t + q(c), 0)).toBe(25);
    expect(CHANNELS.filter((c) => !WARM_CHANNELS.has(c)).reduce((t, c) => t + q(c), 0)).toBe(42);
    expect(q("artist_linked")).toBe(0);
  });

  it("has 86 in flight", () => {
    expect(["slabs_sent", "didnt_pick", "contacted", "ghosting"].reduce((t, s) => t + statusTotal(s as (typeof STATUS_CODES)[number]), 0)).toBe(86);
  });

  it("has the prospect and converted amounts", () => {
    expect(PROSPECTS.reduce((t, p) => t + p.amount, 0)).toBe(3_075_000);
    const top5 = [...PROSPECTS].sort((a, b) => b.amount - a.amount).slice(0, 5).reduce((t, p) => t + p.amount, 0);
    expect(top5 / 3_075_000).toBeCloseTo(0.585, 3);
    expect(CONVERTED.reduce((t, v) => t + v.total, 0)).toBe(1_100_000);
    expect(CONVERTED.reduce((t, v) => t + v.inKind, 0)).toBe(110_000);
    for (const c of CHANNELS) {
      expect(PROSPECTS.filter((p) => p.channel === c).length).toBeLessThanOrEqual(MATRIX[c].prospective ?? 0);
      expect(CONVERTED.filter((p) => p.channel === c).length).toBeLessThanOrEqual(MATRIX[c].converted ?? 0);
    }
  });
});