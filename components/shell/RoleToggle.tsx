"use client";

import { useRouter } from "next/navigation";
import { useTransition, type KeyboardEvent } from "react";
import type { DemoRole } from "@/lib/session";

export function RoleToggle(props: { role: DemoRole }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isHead = props.role === "head";

  async function choose(next: DemoRole) {
    if (next === props.role || pending) return;
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: next }),
    });
    if (!res.ok) return;
    startTransition(() => {
      router.push(next === "head" ? "/head" : "/coordinator");
      router.refresh();
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      void choose("head");
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      void choose("coordinator");
    }
  }

  const base =
    "relative z-10 flex h-full flex-1 items-center justify-center rounded-full text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

  return (
    <div
      role="radiogroup"
      aria-label="Role"
      onKeyDown={onKeyDown}
      className="relative flex h-11 min-h-11 w-[220px] items-center rounded-full border-2 border-accent/40 bg-card p-1"
    >
      <span
        aria-hidden
        className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-accent/20 transition-transform duration-200 motion-reduce:transition-none"
        style={{ transform: isHead ? "translateX(0)" : "translateX(100%)" }}
      />
      <button
        type="button"
        role="radio"
        aria-checked={isHead}
        tabIndex={isHead ? 0 : -1}
        onClick={() => void choose("head")}
        className={`${base} ${isHead ? "text-foreground" : "text-muted"}`}
      >
        Head
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={!isHead}
        tabIndex={!isHead ? 0 : -1}
        onClick={() => void choose("coordinator")}
        className={`${base} ${!isHead ? "text-foreground" : "text-muted"}`}
      >
        Coordinator
      </button>
    </div>
  );
}