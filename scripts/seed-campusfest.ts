import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { loadCampusFest } = await import("../lib/seed/campusfest");
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
  const ids = only ? [only] : ["campusfest-2025", "campusfest-2025-work"];
  for (const id of ids) {
    const report = await loadCampusFest("data/Sponsor_Dataset.xlsx", id);
    console.log(`loaded ${id}`);
    console.log(JSON.stringify(report, null, 2));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});