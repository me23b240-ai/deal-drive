export const dynamic = "force-dynamic";

export function notImplemented() {
  return Response.json({ error: "Not implemented yet" }, { status: 501 });
}
