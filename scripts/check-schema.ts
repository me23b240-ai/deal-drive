import { config } from "dotenv";

config({ path: ".env.local" });

const CHECKS: Record<string, string[]> = {
  deals: ["id", "stage", "proposed_value_inr", "payment_terms", "terms_status", "approval_note", "mou_sent_at", "mou_signed_at", "signed_value_inr", "signed_cash_inr", "signed_in_kind_inr", "stage_changed_at", "next_follow_up"],
  deal_items: ["id", "deal_id", "catalog_id", "creator_id", "name", "category", "qty", "unit_price_inr", "in_kind", "is_custom", "is_ugc", "created_at"],
  mous: ["id", "deal_id", "brand_name", "official_address", "signatory_name", "signatory_designation", "tagline", "gstin", "deliverables", "amount_inr", "payment_split", "mou_date", "proforma_due_date", "delivery_window", "signed_on", "updated_at"],
  creators: ["id", "event_id", "handle", "name", "niche", "followers", "city", "status", "rate_inr", "notes", "owner_id"],
  lead_candidates: ["id", "event_id", "company_name", "norm_name", "signal_tag", "source", "suggested_angle", "status", "assigned_to", "brand_id", "created_by", "created_at"],
  peer_fests: ["id", "event_id", "name", "city", "starts_on", "ends_on", "url", "status", "claimed_by", "created_at"],
  peer_sponsors: ["id", "fest_id", "name", "sector", "sponsor_tier", "year", "source_url", "evidence_note", "lead_id", "created_by", "created_at"],
  intros: ["id", "event_id", "owner_id", "asked_of_type", "asked_of_name", "target_brand", "brand_id", "asked_on", "given", "given_on", "note", "created_at"],
  deliverable_catalog: ["id", "event_id", "category", "name", "price_min_inr", "price_max_inr", "sold", "sold_to"],
  packages: ["id", "event_id", "name", "price_inr", "headline", "tier_order"],
  tasks: ["id", "title", "description", "owner_id", "brand_id", "due_date", "status", "source", "completed_at"],
  activities: ["id", "brand_id", "owner_id", "event_type", "outcome", "summary", "occurred_at", "personalised", "email_draft_id"],
  email_drafts: ["id", "brand_id", "subject", "opening_paragraph", "body_html", "personalised", "inputs", "status", "sent_at", "sequence_step"],
  eod_reports: ["id", "member_id", "report_date", "auto_summary", "note", "submitted_at"],
  import_batches: ["id", "event_id", "owner_id", "filename", "rows_total", "rows_imported", "rows_skipped", "notes"],
  v_deal_desk: ["deal_id", "stage", "payment_terms", "terms_status", "mou_sent_at", "mou_lag_bdays"],
};

async function main(): Promise<void> {
  const { getServiceClient } = await import("../lib/db/client");
  const supabase = getServiceClient();
  let fails = 0;
  for (const [table, cols] of Object.entries(CHECKS)) {
    const { error } = await supabase.from(table).select(cols.join(", ")).limit(1);
    if (error) fails += 1;
    console.log(error ? `FAIL ${table}: ${error.message}` : `PASS ${table}`);
  }
  console.log(`\nSummary: ${fails} FAIL`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});