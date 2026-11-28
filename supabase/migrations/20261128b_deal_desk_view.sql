-- Keep MoU-sent deals on the desk and expose terms, approval status and the MoU lag.
-- New columns are appended at the end, so existing readers keep working.
create or replace view public.v_deal_desk with (security_invoker = true) as
select d.id as deal_id, d.event_id, d.brand_id, b.name as company, b.owner_id, d.stage,
       coalesce(d.proposed_value_inr, 0) as proposed_inr, d.next_follow_up,
       coalesce(b.last_touch_at, d.stage_changed_at, d.created_at) as last_touch,
       business_days_between(coalesce(b.last_touch_at, d.stage_changed_at, d.created_at),
                             coalesce(e.as_of, now()), d.event_id) as idle_bdays,
       (select count(*) from activities a
         where a.brand_id = b.id and a.event_type = 'follow_up'
           and a.occurred_at > coalesce(d.created_at, '-infinity'::timestamptz)) as nudges,
       d.payment_terms,
       d.terms_status,
       d.mou_sent_at,
       case when d.mou_sent_at is null then null
            else business_days_between(d.mou_sent_at::timestamptz, coalesce(e.as_of, now()), d.event_id)
       end as mou_lag_bdays
from deals d
join brands b on b.id = d.brand_id
join events e on e.id = d.event_id
where d.stage in ('prospecting', 'proposal_sent', 'negotiating', 'mou_sent') and b.crm_status is not null;