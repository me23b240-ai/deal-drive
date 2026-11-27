import { existsSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { computeAnchors, parseCampusFest, type Parsed } from "@/lib/seed/campusfest-parse";

const FILE = "data/Sponsor_Dataset.xlsx";

describe.skipIf(!existsSync(FILE))("campusfest parse (needs the xlsx, no database)", () => {
  let p: Parsed;
  beforeAll(async () => {
    p = await parseCampusFest(FILE);
  });

  it("removes the known import retries", () => {
    expect(p.removed).toEqual({ interactions: 3, qualification: 1, history: 2 });
  });

  it("reads IST wall-clock times", () => {
    expect(p.asOf).toBe("2025-04-20T23:59:59+05:30");
    expect(String(p.brands[0].created_at)).toMatch(/\+05:30$/);
  });

  it("matches the dataset anchors", () => {
    const a = computeAnchors(p);
    expect(a.brands).toBe(180);
    expect(a.contacts).toBe(270);
    expect(a.campaigns).toBe(6);
    expect(a.opportunities).toBe(58);
    expect(a.confirmed).toBe(24);
    expect(a.confirmedValue).toBe(2_240_000);
    expect(a.cashValue).toBe(2_000_000);
    expect(a.inKindValue).toBe(240_000);
    expect(a.qualifiedBrands).toBe(60);
    expect(a.optOuts).toBe(7);
    expect(a.nonWarm.signed).toBe(0);
  });
});