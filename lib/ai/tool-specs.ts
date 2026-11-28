import { READ_TOOLS } from "@/lib/ai/tools";

export type ToolSpec = { name: string; description: string; parametersJsonSchema: Record<string, unknown> };

const obj = (properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
});
const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });

export const COORDINATOR_TOOLS: ReadonlySet<string> = new Set([
  "get_needs_update",
  "list_companies",
  "get_company",
  "get_weekly_target_status",
  "get_deal_desk",
  "get_data_limitations",
  "calculate",
  "propose_task",
  "propose_follow_up",
  "propose_nudge_deal",
]);

export const TOOL_SPECS: ToolSpec[] = [
  { name: "get_overview", description: "Headline KPIs: funnel counts, bottleneck stage, prospective value, signed value and deals, cash scheduled/collected/pending, this week's team outreach vs target.", parametersJsonSchema: obj() },
  { name: "get_funnel", description: "Funnel overall, by source channel and by warm vs other, with counts at each stage.", parametersJsonSchema: obj() },
  { name: "get_initiative_status", description: "The five bets with live SCALE/CHANGE/STOP/BEHIND/HOLD/TOO EARLY badge, reason and metrics.", parametersJsonSchema: obj() },
  { name: "get_member_performance", description: "Per coordinator: outreach this week vs target, responses, prospective, converted, ghosting, amounts, companies needing update, last active.", parametersJsonSchema: obj() },
  { name: "get_weekly_target_status", description: "Weekly outreach target vs actual. Head: all coordinators (optional member name). Coordinator: own week strip with required per-day pace.", parametersJsonSchema: obj({ member: str("Coordinator name (head only, optional)") }) },
  { name: "get_needs_update", description: "Companies idle past their threshold or with a follow-up due, biggest amount first.", parametersJsonSchema: obj({ limit: num("Max rows, default 15") }) },
  { name: "list_companies", description: "List companies with status, channel, tier, amount, follow-up, idle business days. Filters optional.", parametersJsonSchema: obj({ status: str("CRM status code, e.g. prospective"), channel: str("Channel code, e.g. past_sponsors"), tier: str("Company tier"), needs_update: { type: "boolean" }, q: str("Name search"), sort: str("company|status|amount|follow_up|last_update"), limit: num("Max rows, default 15") }) },
  { name: "get_company", description: "Full detail for one company: contacts, timeline, deal, payments. Give a name or id.", parametersJsonSchema: obj({ name: str("Company name"), company_id: str("Company id") }) },
  { name: "get_deal_desk", description: "Open deals (prospecting, proposal sent, negotiating) ranked by value with idle days and nudges; top-5 concentration.", parametersJsonSchema: obj() },
  { name: "get_payments_status", description: "Scheduled, collected and pending cash by phase (pre-fest / post-fest) and per deal.", parametersJsonSchema: obj() },
  { name: "get_gates_status", description: "Portfolio gates (7/14/21 Dec): base, stretch, actual signed, status, gap to base, pace line.", parametersJsonSchema: obj() },
  { name: "get_lead_supply", description: "Warm lead pool vs what base and stretch need, per bet.", parametersJsonSchema: obj() },
  { name: "run_projection", description: "What-if on the plan model. Overrides are optional and are NOT saved. Rates are fractions (0.25 = 25%). Returns current vs scenario.", parametersJsonSchema: obj({ avg_new_deal_inr: num("Average new deal in INR"), prefest_share: num("Share of cash paid before fest, 0-1"), inkind_scope: str("all or new_only"), stretch_warm_leads: num("Total warm leads in stretch"), stretch_other_leads: num("Other leads in stretch"), close_rate_base: num("Open-prospect close rate, base"), close_rate_stretch: num("Open-prospect close rate, stretch"), inkind_base: num("In-kind share, base"), inkind_stretch: num("In-kind share, stretch"), warm_response_base: num("Warm response rate, base"), warm_proposal_rate_base: num("Warm proposal rate, base"), warm_sign_rate_base: num("Warm sign rate, base") }) },
  { name: "get_model_table", description: "The plan model table (floor/base/stretch per line), worked example, and observed vs assumed rates with sample sizes.", parametersJsonSchema: obj() },
  { name: "get_experiment_status", description: "Personalised vs template cold test: n sent, reached proposal, ratio, directional flag.", parametersJsonSchema: obj() },
  { name: "get_inventory", description: "Sponsorship inventory: sold vs unsold by category, unsold value range, packages.", parametersJsonSchema: obj() },
  { name: "suggest_slab", description: "Suggest a package plus unsold add-ons for a sponsor budget.", parametersJsonSchema: obj({ budget_inr: num("Sponsor budget in INR") }, ["budget_inr"]) },
  { name: "get_campaign_funnel_historical", description: "CampusFest 2025 historical funnel by channel and by warm vs other (FACT). Use for evidence and benchmarks.", parametersJsonSchema: obj() },
  { name: "get_targets_vs_actual", description: "Team goals vs signed and cash so far, plus base and stretch projection.", parametersJsonSchema: obj() },
  { name: "compare", description: "Compare two channels, two coordinators or two bets side by side with differences.", parametersJsonSchema: obj({ kind: str("channel | member | initiative"), a: str("First item (channel code, member name or bet code)"), b: str("Second item") }, ["kind", "a", "b"]) },
  { name: "get_data_limitations", description: "What this dataset and model cannot answer. Call before declining or hedging.", parametersJsonSchema: obj() },
  { name: "calculate", description: "Evaluate an arithmetic expression (+ - * / parentheses, decimals). Use 0.25 for 25%. Returns the value with INR, lakh and percent forms.", parametersJsonSchema: obj({ expression: str("e.g. (1100000 + 3075000*0.4) * 0.95 * 0.75") }, ["expression"]) },
  { name: "propose_task", description: "Propose a task for user confirmation. Nothing is created until they confirm.", parametersJsonSchema: obj({ title: str("Task title, max 140 chars"), owner_name: str("Coordinator who owns it (head only)"), company_name: str("Related company, optional"), due_on: str("YYYY-MM-DD, optional") }, ["title"]) },
  { name: "propose_follow_up", description: "Propose setting a company's next follow-up date, for confirmation.", parametersJsonSchema: obj({ company_name: str("Company name"), date: str("YYYY-MM-DD") }, ["company_name", "date"]) },
  { name: "propose_nudge_deal", description: "Propose logging a nudge on an open deal (resets its idle clock), for confirmation.", parametersJsonSchema: obj({ company_name: str("Company name of the open deal") }, ["company_name"]) },
];

export function specsFor(role: "head" | "coordinator"): ToolSpec[] {
  return role === "head" ? TOOL_SPECS : TOOL_SPECS.filter((t) => COORDINATOR_TOOLS.has(t.name));
}

/** READ_TOOLS names that have no spec (should be empty). Used by test:chat. */
export function missingSpecs(): string[] {
  const have = new Set(TOOL_SPECS.map((t) => t.name));
  return READ_TOOLS.filter((t) => !have.has(t));
}