# STATE NOTE: head-b

## Files created or changed
- app\head\_tabs\{deal-desk,risks,settings,eod,inventory,benchmark,data-lab}.tsx
- components\head\{DealDesk,PaymentsPanel,DecisionsList,SettingsForms,EodFeed,InventoryTable,BenchmarkView,DataLab}.tsx
- lib\db\queries\head-b-{deals,payments,inventory,slab,eod,tasks,risks,settings,benchmark,datalab}.ts
- app\api\head\{deals,payments,decisions,settings}\route.ts, app\api\head\settings\datalab\route.ts
- app\api\campusfest\{upload,reset}\route.ts

## Query functions used
getCtx, getDealDesk, getDecisions, getDecisionSnapshot, getLeadSupply, getPlanSettings, getAssumptions, getStaleRules, getTeamGoals, getHolidays, listTeam, coordinatorsOf, updateDeal, nudgeDeal (crm-deals), OPEN_DEAL_STAGES, fetchAll, num, loadCampusFest, requireHead, assertWritable, apiOk, apiFail.

## Behaviour notes
- Payments are scoped through the event's confirmed deals (payments has no event column). Only the head marks received, with Undo.
- Create tasks (Risks) inserts tasks with source head_decision, owner_id set to the target coordinator, skipping tasks already open with the same title. Escalate creates one task for the deal owner.
- Plan settings are saved in events.model_assumptions.plan; dates and use_observed at the top level of model_assumptions (matches lib\model\assumptions.ts).
- Initiative rules are validated with validateRuleJson (no exported zod schema exists in rules-engine.ts).
- Data lab qualification edits insert a qualification_history row dated at the event as_of.

## Assumptions
- Qualified brands target compares against the latest status literally named "qualified".
- Days created to confirmed uses deals.created_at to stage_changed_at; compare with docs\slide1-anchors.md.
- Data lab deal edits set stage_changed_at to now, which changes the days statistic.

## Open TODOs / requests for foundation
1. createPaymentRows (crm-status.ts) ignores prefest_due_date and postfest_due_date settings and uses event start minus 1 day and event end plus 15 days.
2. The Plan tab does not read use_observed, so the Settings toggle only stores the value.
3. rules-engine.ts has no exported zod schema; Settings uses validateRuleJson.
4. No moveDealStage exists: the Deal desk stage dropdown covers open stages only. Converted or Lost go through changeCompanyStatus in the coordinator view.
5. /api/campusfest/reset reads data\Sponsor Dataset.xlsx from process.cwd(); on Vercel the file must be included in the build trace (outputFileTracingIncludes).
6. loadCampusFest parses before wiping, but a failure mid-insert can leave a partial working copy; Reset to original recovers it.
7. Carry-over from head-a: brands.initiative_id is text while getInitiativeStatuses compares it to the campaign uuid; verify the bet-5 experiment arms are not empty.