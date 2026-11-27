import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { seedSaarang } = await import("../lib/seed/saarang");
  const anchor = process.argv.find((arg) => arg.startsWith("--anchor="))?.slice(9);
  const report = await seedSaarang(anchor);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});