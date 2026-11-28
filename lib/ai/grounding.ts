/** Numbers (2+ digits) in the answer that appear nowhere in the tool results or the conversation. Heuristic, not proof. */
export function ungroundedNumbers(text: string, facts: string[]): string[] {
    const allowed = facts.join(" ").replace(/,/g, "");
    const nums = text.replace(/,/g, "").match(/\d{2,}(?:\.\d+)?/g) ?? [];
    return [...new Set(nums.filter((n) => !allowed.includes(n)))];
  }