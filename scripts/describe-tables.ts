import { config } from "dotenv";

config({ path: ".env.local" });

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env names.");
  const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Could not read the schema (${res.status}).`);
  const spec = (await res.json()) as { definitions?: Record<string, { properties?: Record<string, { format?: string; type?: string }> }> };
  const defs = spec.definitions ?? {};
  const wanted = /deal|mou|lead|peer|sponsor|intro|creator|payment|catalog|package/i;
  for (const name of Object.keys(defs).sort()) {
    if (!wanted.test(name)) continue;
    const cols = Object.entries(defs[name]?.properties ?? {}).map(([k, v]) => `${k} ${v.format ?? v.type ?? ""}`.trim());
    console.log(`${name}: ${cols.join(", ")}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});