"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiResult } from "./types";
import { useToast } from "./ui";

export async function callApi<T>(
  url: string,
  method: "GET" | "POST" | "PATCH",
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as ApiResult<T> | null;
    if (json && typeof json.ok === "boolean") return json;
    return { ok: false, error: `Request failed (${res.status}). Please retry.` };
  } catch {
    return { ok: false, error: "Network error. Check your connection and retry." };
  }
}

export function useMutation() {
  const router = useRouter();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);

  async function run<T>(
    url: string,
    method: "POST" | "PATCH",
    body: unknown,
    successText?: string,
    opts?: { silentError?: boolean },
  ): Promise<ApiResult<T>> {
    setBusy(true);
    const result = await callApi<T>(url, method, body);
    setBusy(false);
    if (result.ok) {
      if (successText) push("success", successText);
      router.refresh();
    } else if (!opts?.silentError) {
      push("error", result.error);
    }
    return result;
  }

  return { run, busy };
}