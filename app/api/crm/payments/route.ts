// Remove: export { dynamic } from "@/lib/api/not-implemented";
export const dynamic = "force-dynamic";
import { notImplemented } from "@/lib/api/not-implemented";

export function GET() {
  return notImplemented();
}

export function POST() {
  return notImplemented();
}
