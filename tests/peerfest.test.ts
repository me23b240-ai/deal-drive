import { describe, expect, it } from "vitest";
import { MIN_SCORE_N, buildScorecard, festTiming, scoreOf, type ScoreInput } from "@/lib/model/peerfest";
import { FESTS, SPONSORS } from "@/lib/seed/constants/peerfests";

const row = (festId: string, p: Partial<ScoreInput> = {}): ScoreInput => ({ festId, outreached: true, responded: false, proposal: false, signed: false, ...p });

describe("fest timing", () => {
  it("tags fests before or after Saarang", () => {
    expect(festTiming("2026-12-20")).toBe("before");
    expect(festTiming("2027-01-05")).toBe("before");
    expect(festTiming("2027-01-06")).toBe("after");
    expect(festTiming("2027-02-05")).toBe("after");
    expect(festTiming(null)).toBeNull();
  });
});

describe("source score", () => {
  it("computes the three rates and flags small samples", () => {
    const rows = [
      row("a", { responded: true, proposal: true, signed: true }),
      row("a", { responded: true, proposal: true }),
      row("a", { responded: true }),
      row("a"),
    ];
    const s = scoreOf(rows);
    expect(s.n).toBe(4);
    expect(s.responseRate).toBeCloseTo(0.75, 9);
    expect(s.proposalRate).toBeCloseTo(2 / 3, 9);
    expect(s.signRate).toBeCloseTo(0.5, 9);
    expect(s.insufficient).toBe(true);
  });
  it("has no rates without data and is sufficient at the threshold", () => {
    const empty = scoreOf([]);
    expect(empty.responseRate).toBeNull();
    expect(empty.proposalRate).toBeNull();
    expect(scoreOf(Array.from({ length: MIN_SCORE_N }, () => row("a"))).insufficient).toBe(false);
    expect(scoreOf(Array.from({ length: MIN_SCORE_N - 1 }, () => row("a"))).insufficient).toBe(true);
  });
  it("ignores brands that were never outreached", () => {
    expect(scoreOf([row("a", { outreached: false, responded: true })]).n).toBe(0);
  });
  it("groups by fest and by before or after", () => {
    const fests = [
      { id: "a", name: "A", timing: "before" as const },
      { id: "b", name: "B", timing: "after" as const },
      { id: "c", name: "C", timing: null },
    ];
    const sc = buildScorecard([row("a"), row("a"), row("b"), row("c")], fests);
    expect(sc.byFest.map((x) => x.score.n)).toEqual([2, 1, 1]);
    expect(sc.byTiming.map((x) => [x.timing, x.score.n])).toEqual([["before", 2], ["after", 1]]);
  });
});

describe("simulated peer fest seed", () => {
  it("has 12 fests: 6 IIT, 3 Bangalore or Mumbai, 3 Chennai", () => {
    expect(FESTS.length).toBe(12);
    expect(FESTS.filter((f) => f.tier === "iit").length).toBe(6);
    expect(FESTS.filter((f) => ["Bangalore", "Mumbai"].includes(f.city)).length).toBe(3);
    expect(FESTS.filter((f) => f.city === "Chennai").length).toBe(3);
  });
  it("has fests both before and after Saarang, with valid dates", () => {
    const t = FESTS.map((f) => festTiming(f.start));
    expect(t).toContain("before");
    expect(t).toContain("after");
    for (const f of FESTS) expect(f.end >= f.start).toBe(true);
  });
  it("has 30 simulated sponsors that point at real fests", () => {
    expect(SPONSORS.length).toBe(30);
    for (const s of SPONSORS) {
      expect(s.name.endsWith("(demo)")).toBe(true);
      expect(FESTS[s.fest]).toBeDefined();
    }
    expect(new Set(SPONSORS.map((s) => s.name)).size).toBe(30);
  });
  it("marks every fest as simulated in its name", () => {
    for (const f of FESTS) expect(f.name.endsWith("(SIM)")).toBe(true);
  });
});