"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function MemberPicker(props: { members: { id: string; name: string }[]; memberId: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function choose(id: string) {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: id }),
    });
    if (res.ok) startTransition(() => router.refresh());
  }

  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <span>Coordinator</span>
      <select
        value={props.memberId ?? ""}
        disabled={pending}
        onChange={(event) => void choose(event.target.value)}
        className="h-9 rounded-lg border border-border bg-card px-2 text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        {props.members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </select>
    </label>
  );
}