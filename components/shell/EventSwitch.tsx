const EVENTS = [
  { id: "saarang-2027", label: "Saarang 2027" },
  { id: "campusfest-2025-work", label: "CampusFest work" },
  { id: "campusfest-2025", label: "CampusFest original" },
] as const;

export function EventSwitch(props: { eventId: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {EVENTS.map((event) => (
        <span
          key={event.id}
          className={
            event.id === props.eventId
              ? "rounded-full border border-accent px-3 py-1 text-accent"
              : "rounded-full border border-border px-3 py-1 text-muted"
          }
        >
          {event.label}
        </span>
      ))}
      {props.eventId === "campusfest-2025" ? (
        <span className="rounded border border-approx/40 bg-approx/10 px-2 py-1 text-xs text-approx">
          Locked original
        </span>
      ) : null}
    </div>
  );
}
