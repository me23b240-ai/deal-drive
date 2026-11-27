export function numeralsNotInFacts(text: string, facts: string[]): boolean {
  const allowed = facts.join(" ");
  const nums = text.match(/\d+/g) ?? [];
  return nums.some((n) => !allowed.includes(n));
}
