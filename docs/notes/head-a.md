# STATE NOTE: head-a

## Files created or changed
- app\head\page.tsx (tab routing, Suspense, Part B stubs overwritten only if still placeholders)
- app\head\_tabs\{overview,plan,initiatives,team}.tsx
- components\head\{KpiCards,FunnelChart,TeamTable,InitiativeCards,GatesChart,ModelTable,LeadSupply}.tsx
- lib\db\queries\head-a-{overview,team,plan,initiatives}.ts
- app\api\head\initiatives\route.ts (PATCH budget, spend, status)

## Query functions used
getCtx, getHeadKpis, getTeamWeekSummary, getSignedDeals, getPlanModel, getGateReport, getTeamGoals, getWarmthFunnel, getInitiativeStatuses, getCoordSummary, getNeedsUpdate, listTeam, coordinatorsOf, fetchAll, num, requireHead, assertWritable, apiOk, apiFail.

## Shared exports other sessions may reuse
KpiCards.tsx exports Card, ErrorBox and EmptyBox.

## Live schema facts (verified against the applied database)
- campaigns columns: id, event_id, source_id, name, channel, objective, audience, owner_id, planned_start, planned_end, budget_inr (integer), spend_inr (integer), status, scale_rule, change_rule, stop_rule, kind, concept, kpis, expected_stretch_cash_inr.
- supabase\cursor_backup\001_core.sql does NOT match the applied schema. Do not trust it for column names.
- Initiative status, budget and spend are saved straight to campaigns.status, budget_inr and spend_inr.

## Assumptions
- Observed rates are marked "enough" at n >= 30 outreached (MIN_OBSERVED_N in head-a-plan.ts).
- Cash collected, scheduled and pending come from v_cash_summary through getHeadKpis.
- Expected stretch per bet is campaigns.expected_stretch_cash_inr; the concept falls back to a constant per bet when campaigns.concept is empty.

## Open TODOs
- The "Use observed" toggle belongs in Settings (Part B). The Plan tab only displays observed vs assumed.
- If saving an initiative status fails, campaigns.status may have a check constraint; the option list in InitiativeCards.tsx (active, paused, stopped, done) would then need to match it.

## Requests for other sessions (foundation)
1. brands.initiative_id is text, while getInitiativeStatuses compares it to the campaign uuid. If seeds store "bet-3", the bet-5 experiment arms are empty. Verify with one row.
2. Resolved: the brands.owner_id concern. The live campaigns table uses owner_id, so brands most likely does too.