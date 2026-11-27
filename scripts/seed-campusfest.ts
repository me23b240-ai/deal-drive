import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { loadCampusFest } = await import("../lib/seed/campusfest");
  await loadCampusFest("data/Sponsor_Dataset.xlsx", "campusfest-2025");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
