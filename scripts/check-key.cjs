require("dotenv").config({ path: ".env.local" });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
console.log("url set:", url.startsWith("https://"), "| host:", url.replace("https://", "").split(".")[0].slice(0, 4) + "...");
console.log("key length:", key.length);
if (key.startsWith("sb_secret_")) console.log("key type: new secret key (correct)");
else if (key.startsWith("sb_publishable_")) console.log("key type: PUBLISHABLE key (WRONG, need the secret key)");
else if (key.startsWith("eyJ")) {
  try {
    const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
    console.log("key type: legacy JWT, role =", payload.role, payload.role === "service_role" ? "(correct)" : "(WRONG, need service_role)");
  } catch { console.log("key type: unreadable JWT"); }
} else console.log("key type: unknown format");