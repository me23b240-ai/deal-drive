-- Deal Drive 003: live views. Never store needs-update; compute it here.

create or replace view v_needs_update as
select
  b.*,
  business_days_between(coalesce(b.last_touch_at::date, b.created_at::date), (timezone('Asia/Kolkata', now()))::date, b.event_id) as idle_bdays,
  sr.business_days as stale_threshold,
  case
    when b.next_follow_up is not null and b.next_follow_up <= (timezone('Asia/Kolkata', now()))::date then 'follow-up due'
    else 'stale'
  end as flag_reason
from brands b
left join stale_rules sr
  on sr.event_id = b.event_id and sr.status_key = b.crm_status
where
  b.crm_status not in ('converted', 'rejected', 'left_company', 'wrong_number')
  and (
    (b.next_follow_up is not null and b.next_follow_up <= (timezone('Asia/Kolkata', now()))::date)
    or (
      b.next_follow_up is null
      and sr.business_days is not null
      and business_days_between(
        coalesce(b.last_touch_at::date, b.created_at::date),
        (timezone('Asia/Kolkata', now()))::date,
        b.event_id
      ) >= sr.business_days
    )
  );

create or replace view v_deal_desk as
select
  d.*,
  b.name as company_name,
  b.source_channel,
  b.crm_status,
  b.approx_amount_inr as brand_approx_inr,
  tm.name as owner_name,
  business_days_between(
    coalesce(b.last_touch_at::date, d.created_at::date),
    (timezone('Asia/Kolkata', now()))::date,
    d.event_id
  ) as idle_bdays
from deals d
join brands b on b.id = d.brand_id
left join team_members tm on tm.id = d.owner_member_id
where d.stage in ('prospecting', 'proposal_sent', 'negotiating');

create or replace view v_initiative_funnel as
select
  b.event_id,
  coalesce(b.initiative_id, 'unassigned') as initiative_id,
  count(*) filter (where b.first_outreach_at is not null) as outreached,
  count(*) filter (where b.first_response_at is not null) as responded,
  count(*) filter (where b.crm_status in ('prospective', 'converted')) as prospective_or_better,
  count(*) filter (where b.crm_status = 'converted') as converted,
  coalesce(sum(b.final_amount_inr) filter (where b.crm_status = 'converted'), 0) as signed_inr
from brands b
group by b.event_id, coalesce(b.initiative_id, 'unassigned');

create or replace view v_warmth_funnel as
select
  b.event_id,
  case
    when b.source_channel in ('past_sponsors', 'other_fest', 'artist_linked', 'inbound_referral', 'institute')
      then 'warm'
    else 'other'
  end as warmth,
  count(*) filter (where b.first_outreach_at is not null) as outreached,
  count(*) filter (where b.first_response_at is not null) as responded,
  count(*) filter (where exists (
    select 1 from status_events se
    where se.brand_id = b.id and se.to_status in ('prospective', 'converted')
  ) or b.crm_status in ('prospective', 'converted')) as prospective_or_better,
  count(*) filter (where b.crm_status = 'converted') as converted
from brands b
group by 1, 2;

create or replace view v_weekly_progress as
select
  b.event_id,
  b.owner_member_id as member_id,
  date_trunc('week', timezone('Asia/Kolkata', b.first_outreach_at))::date as week_start,
  count(*) as outreached,
  count(*) filter (where b.first_response_at is not null) as responded
from brands b
where b.first_outreach_at is not null
group by 1, 2, 3;

create or replace view v_coord_summary as
select
  b.event_id,
  b.owner_member_id as member_id,
  count(*) filter (where b.first_outreach_at is not null) as outreached,
  count(*) filter (where b.first_response_at is not null) as responded,
  count(*) filter (where b.crm_status = 'converted') as converted,
  count(*) filter (where b.crm_status = 'prospective') as prospective,
  count(*) filter (where b.crm_status = 'rejected') as rejected,
  count(*) filter (where b.crm_status = 'ghosting') as ghosting,
  coalesce(sum(b.approx_amount_inr) filter (where b.crm_status = 'prospective'), 0) as approx_inr,
  coalesce(sum(b.final_amount_inr) filter (where b.crm_status = 'converted'), 0) as final_inr
from brands b
group by b.event_id, b.owner_member_id;

create or replace view v_member_daily as
select
  a.event_id,
  a.member_id,
  (timezone('Asia/Kolkata', a.occurred_at))::date as on_date,
  count(*) filter (where a.kind = 'mail_sent') as mails_sent,
  count(*) filter (where a.kind in ('call', 'call_no_answer')) as calls,
  count(*) as activities
from activities a
group by 1, 2, 3;

create or replace view v_funnel_by_campaign as
select
  c.event_id,
  c.id as campaign_id,
  c.source_id,
  c.name,
  count(distinct b.id) filter (where b.first_outreach_at is not null) as brands_touched,
  count(distinct d.id) as opportunities,
  count(distinct d.id) filter (where d.stage = 'partner_confirmed') as signed_deals,
  coalesce(sum(
    coalesce(d.signed_cash_inr, 0) + coalesce(d.signed_in_kind_inr, 0)
  ) filter (where d.stage = 'partner_confirmed'), 0) as signed_inr
from campaigns c
left join brands b
  on b.event_id = c.event_id
  and (
    (c.kind = 'channel' and b.source_channel = c.source_id)
    or (c.kind = 'initiative' and b.initiative_id = c.source_id)
  )
left join deals d on d.brand_id = b.id
group by c.event_id, c.id, c.source_id, c.name;
