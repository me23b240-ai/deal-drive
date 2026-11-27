"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useQueryNav() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setParams(updates: Record<string, string | null>, opts?: { push?: boolean }) {
    const next = new URLSearchParams(sp.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (opts?.push) router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
  }

  return { sp, setParams };
}