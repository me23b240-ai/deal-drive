"use client";

import { useQueryNav } from "./nav";
import { FOCUS } from "./styles";

export type CoordTab = "crm" | "queue" | "deals" | "drafts" | "import";

const TABS: { id: CoordTab; label: string }[] = [
  { id: "queue", label: "My queue" },
  { id: "crm", label: "CRM" },
  { id: "deals", label: "Deal desk" },
  { id: "drafts", label: "Mail drafts" },
  { id: "import", label: "Import" },
];

export function CoordTabs({ active }: { active: CoordTab }) {
  const { setParams } = useQueryNav();
  return (
    <div role="tablist" aria-label="Coordinator sections" className="flex flex-wrap gap-1 border-b border-border">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === active}
          onClick={() => setParams({ tab: t.id === "crm" ? null : t.id, company: null }, { push: true })}
          className={`-mb-px border-b-2 px-4 py-2 text-sm ${FOCUS} ${t.id === active ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}