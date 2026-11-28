export const DELIVERABLE_KINDS = ["night", "event", "stall", "standee", "branding", "digital", "ugc_creator", "lounge", "prizes_goodies", "cost_offset", "other"] as const;
export type DeliverableKind = (typeof DELIVERABLE_KINDS)[number];

export const KIND_LABELS: Record<DeliverableKind, string> = {
  night: "Nights / proshows",
  event: "Events and competitions",
  stall: "Stalls",
  standee: "Standees and print",
  branding: "Stage and venue branding",
  digital: "Digital and social",
  ugc_creator: "UGC and creator content",
  lounge: "Lounge",
  prizes_goodies: "Prizes and goodies (in kind)",
  cost_offset: "Cost offset (hotel, flights, production)",
  other: "Other",
};

export type PaidIn = "cash" | "kind_goodies" | "kind_cost_offset";
export const COST_OFFSET_CATEGORIES = ["hotel", "flights", "production", "prizes", "other"] as const;

/** Best-effort mapping from a catalogue category or item name to a kind. Coordinators can change it per item. */
export function kindFor(category: string, name = ""): DeliverableKind {
  const s = `${category} ${name}`.toLowerCase();
  if (/ugc|creator|influenc|reel/.test(s)) return "ugc_creator";
  if (/night|proshow|concert|headliner|title/.test(s)) return "night";
  if (/stall|booth|main street/.test(s)) return "stall";
  if (/standee|flex|banner|print|poster/.test(s)) return "standee";
  if (/stage|venue|branding|backdrop/.test(s)) return "branding";
  if (/social|digital|post|story|website|app|email/.test(s)) return "digital";
  if (/lounge/.test(s)) return "lounge";
  if (/competition|workshop|event|club/.test(s)) return "event";
  if (/prize|goodie|hamper|merch/.test(s)) return "prizes_goodies";
  if (/hotel|flight|travel|accommodation|production|sound|lights/.test(s)) return "cost_offset";
  return "other";
}

export type ChecklistStep = { title: string };

/** Steps every deal goes through before it is signed. Matches the pipeline: outreach to signed MoU, then cash. */
export const CLOSE_STEPS: ChecklistStep[] = [
  { title: "Contact established with decision maker" },
  { title: "Slab shared" },
  { title: "Sponsor reviewed slab and proposal" },
  { title: "Interested deliverables captured" },
  { title: "Negotiation done, final amount agreed" },
  { title: "Paid in confirmed: cash or in kind" },
  { title: "Payment terms agreed (100% / 75-25 / 50-50)" },
  { title: "MoU generated and checked" },
  { title: "MoU sent to sponsor" },
  { title: "MoU signed by both sides" },
  { title: "Proforma invoice sent" },
  { title: "Payment received" },
];

/** Starting points only. They are editable per deal. Not taken from IITM operations documents. */
export const DELIVER_STEPS: Record<DeliverableKind, ChecklistStep[]> = {
  night: [
    { title: "Logo and brand guidelines received" },
    { title: "Night and slot confirmed with the sponsor" },
    { title: "Stage and screen branding design approved" },
    { title: "Announcement and mention script approved" },
    { title: "Sponsor rep passes issued" },
    { title: "Post-event photos and report shared" },
  ],
  event: [
    { title: "Event and naming confirmed" },
    { title: "Logo placed in rulebook, poster and registration page" },
    { title: "Sponsor mention in event announcements" },
    { title: "Prize and goodies delivered by sponsor (if any)" },
    { title: "Winners' list and photos shared" },
  ],
  stall: [
    { title: "Stall size and location confirmed" },
    { title: "Power, internet and furniture needs confirmed" },
    { title: "Setup date and time agreed" },
    { title: "Brand staff passes issued" },
    { title: "Sampling or sales permissions checked" },
    { title: "Teardown done and footfall summary shared" },
  ],
  standee: [
    { title: "Artwork received and sizes confirmed" },
    { title: "Placement locations agreed" },
    { title: "Printing owner and cost settled" },
    { title: "Installed before the fest" },
    { title: "Photos of placements shared" },
  ],
  branding: [
    { title: "Branding areas and sizes confirmed" },
    { title: "Artwork approved" },
    { title: "Installed and photographed" },
  ],
  digital: [
    { title: "Handles, tags and links confirmed" },
    { title: "Post and story count and calendar agreed" },
    { title: "Content approved by sponsor" },
    { title: "Posts published" },
    { title: "Reach and engagement report shared" },
  ],
  ugc_creator: [
    { title: "Creator roster agreed with sponsor" },
    { title: "Brief and key messages shared" },
    { title: "Content drafts approved by sponsor" },
    { title: "Posting dates scheduled" },
    { title: "Content published and tagged" },
    { title: "Performance report shared" },
  ],
  lounge: [
    { title: "Lounge space and layout confirmed" },
    { title: "Branding and product placement approved" },
    { title: "Setup and teardown scheduled" },
  ],
  prizes_goodies: [
    { title: "Items and quantity confirmed" },
    { title: "Delivery date and receiver agreed" },
    { title: "Items received and counted" },
    { title: "Handed to winners and photos taken" },
  ],
  cost_offset: [
    { title: "Exact cost being offset confirmed (hotel, flight, production)" },
    { title: "Value agreed and documented" },
    { title: "Head approval recorded" },
    { title: "Vendor confirmation or booking reference received" },
    { title: "Savings recorded as cost avoided" },
  ],
  other: [{ title: "Deliverable details confirmed" }, { title: "Delivered and evidence saved" }],
};

export type ChecklistRow = { phase: "close" | "deliver"; title: string; dealItemId: string | null; sort: number };

/** Rows to insert when a deal is created or its items change. Every deal also gets a post-event report step. */
export function buildChecklist(items: { id: string; kind: DeliverableKind; name: string }[]): ChecklistRow[] {
  const rows: ChecklistRow[] = [];
  let sort = 0;
  for (const s of CLOSE_STEPS) rows.push({ phase: "close", title: s.title, dealItemId: null, sort: sort++ });
  for (const item of items) {
    for (const s of DELIVER_STEPS[item.kind]) rows.push({ phase: "deliver", title: `${item.name}: ${s.title}`, dealItemId: item.id, sort: sort++ });
  }
  rows.push({ phase: "deliver", title: "Post-event report sent to sponsor", dealItemId: null, sort: sort++ });
  return rows;
}