"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

const EVENTS = [
  { id: "saarang-2027", label: "Saarang 2027" },
  { id: "campusfest-2025-work", label: "CampusFest work" },
  { id: "campusfest-2025", label: "CampusFest original" },
] as const;

export function EventSwitch(props: { eventId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function choose(id: string) {
    if (id === props.eventId || pending) return;
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: id }),
    });
    if (res.ok) startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Dataset">
      {EVENTS.map((event) => (
        <button
          key={event.id}
          type="button"
          aria-pressed={event.id === props.eventId}
          disabled={pending}
          onClick={() => void choose(event.id)}
          className={`rounded-full border px-3 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
            event.id === props.eventId ? "border-accent text-accent" : "border-border text-muted hover:text-foreground"
          }`}
        >
          {event.label}
        </button>
      ))}
      {props.eventId === "campusfest-2025" ? (
        <span className="rounded border border-approx/40 bg-approx/10 px-2 py-1 text-xs text-approx">
          Locked original
        </span>
      ) : null}
    </div>
  );
}