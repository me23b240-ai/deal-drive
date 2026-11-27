"use client";

import type { DemoRole } from "@/lib/session";

export function RoleToggle(props: { role: DemoRole }) {
  const isHead = props.role === "head";
  return (
    <div
      role="radiogroup"
      aria-label="Role"
      className="relative flex h-11 min-h-11 w-[220px] items-center rounded-full border-2 border-accent/40 bg-card p-1"
    >
      <span
        aria-hidden
        className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-accent/20 transition-transform duration-200"
        style={{ transform: isHead ? "translateX(0)" : "translateX(100%)" }}
      />
      <a
        href="/head"
        role="radio"
        aria-checked={isHead}
        className={`relative z-10 flex h-full flex-1 items-center justify-center text-sm ${isHead ? "text-foreground" : "text-muted"}`}
      >
        Head
      </a>
      <a
        href="/coordinator"
        role="radio"
        aria-checked={!isHead}
        className={`relative z-10 flex h-full flex-1 items-center justify-center text-sm ${!isHead ? "text-foreground" : "text-muted"}`}
      >
        Coordinator
      </a>
    </div>
  );
}
