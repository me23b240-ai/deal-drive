import { config } from "dotenv";

config({ path: ".env.local" });

async function main(): Promise<void> {
  const { seedPeerFests } = await import("../lib/seed/peerfests");
  const report = await seedPeerFests("saarang-2027", process.argv.includes("--flag-approvals"));
  console.log(JSON.stringify(report));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});