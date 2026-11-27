import { errorMessage, errorStatus } from "@/lib/db/errors";

export function apiOk<T>(data: T): Response {
  return Response.json({ ok: true, data });
}

export function apiFail(error: unknown): Response {
  return Response.json({ ok: false, error: errorMessage(error) }, { status: errorStatus(error) });
}