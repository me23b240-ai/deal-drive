import { describe, expect, it } from "vitest";
import { validateOpening, wordCount } from "@/lib/ai/guards";
import { nextStep, stepAccess } from "@/lib/mail/steps";
import { buildEmail, genericOpening, type SequenceStep } from "@/lib/mail/template";

const sent = (...s: SequenceStep[]) => new Set<SequenceStep>(s);

describe("mail steps", () => {
  it("offers the first mail to a fresh company", () => {
    expect(nextStep("to_contact", sent())).toBe("initial");
  });
  it("unlocks follow-ups in order", () => {
    expect(nextStep("slabs_sent", sent("initial"))).toBe("follow_up_1");
    expect(nextStep("slabs_sent", sent("initial", "follow_up_1"))).toBe("follow_up_2");
    expect(nextStep("slabs_sent", sent("initial", "follow_up_1", "follow_up_2"))).toBeNull();
  });
  it("blocks follow-up 2 until follow-up 1 is sent", () => {
    const a = stepAccess("slabs_sent", sent("initial"));
    expect(a.follow_up_2.enabled).toBe(false);
    expect(a.follow_up_2.reason).toContain("follow-up 1");
  });
  it("closes everything for a converted company", () => {
    expect(nextStep("converted", sent("initial"))).toBeNull();
  });
});

describe("mail template", () => {
  it("builds subject, text and html with the opening and sender", () => {
    const m = buildEmail({ step: "initial", eventName: "Saarang", senderName: "Asha", company: "Acme", contactName: "Ravi", opening: "Hello opening." });
    expect(m.subject).toContain("Acme");
    expect(m.text).toContain("Dear Ravi,");
    expect(m.text).toContain("Hello opening.");
    expect(m.text).toContain("Asha");
    expect(m.html).toContain("<p>");
  });
  it("escapes html in the opening", () => {
    const m = buildEmail({ step: "initial", eventName: "E", senderName: "S", company: "C", contactName: null, opening: "a <b> & c" });
    expect(m.html).toContain("a &lt;b&gt; &amp; c");
    expect(m.text).toContain("Hello,");
  });
  it("uses different wording for each step", () => {
    expect(genericOpening("follow_up_1", "E", "C")).toContain("follow up");
    expect(genericOpening("follow_up_2", "E", "C")).toContain("last note");
  });
});

describe("ai guards", () => {
  const facts = [{ id: "f1", fact: "Last year the fest drew 50000 visitors." }];
  it("accepts a clean opening that cites a known fact", () => {
    const r = validateOpening("We loved your campaign and think it fits our audience.", ["f1"], facts);
    expect(r.ok).toBe(true);
  });
  it("rejects numbers that are not in the facts", () => {
    const r = validateOpening("Our fest reaches 99999 people.", [], facts);
    expect(r.ok).toBe(false);
  });
  it("allows numbers that appear in the facts", () => {
    expect(validateOpening("The fest drew 50000 visitors.", ["f1"], facts).ok).toBe(true);
  });
  it("rejects unknown fact ids, long text, links and multiple paragraphs", () => {
    expect(validateOpening("Fine.", ["zzz"], facts).ok).toBe(false);
    expect(validateOpening(Array(95).fill("word").join(" "), [], facts).ok).toBe(false);
    expect(validateOpening("See https://example.com", [], facts).ok).toBe(false);
    expect(validateOpening("One.\n\nTwo.", [], facts).ok).toBe(false);
    expect(wordCount("a b c")).toBe(3);
  });
});