export function formatInr(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded).toString();
  const last3 = abs.slice(-3);
  const rest = abs.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `₹${sign}${rest ? `${grouped},${last3}` : last3}`;
}

export function formatLakh(amount: number): string {
  return `₹${(amount / 100_000).toFixed(1)}L`;
}
