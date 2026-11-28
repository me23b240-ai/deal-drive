-- Run after 004a. Idempotent.

-- ---------- new tables first (brands will reference them) ----------
create table if not exists peer_fests (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  name text not null,
  institution text not null,
  city text not null,
  tier text not null check (tier in ('iit','iim','other')),
  starts_on date,
  ends_on date,
  sponsor_page_url text,
  research_status text not null default 'todo' check (research_status in ('todo','researching','done')),
  researcher_id uuid references team_members(id) on delete set null,
  sponsors_found int not null default 0,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists peer_fest_sponsors (
  id uuid primary key default gen_random_uuid(),
  peer_fest_id uuid not null references peer_fests(id) on delete cascade,
  brand_name text not null,
  sector text,
  sponsor_tier text,
  year int,
  source_url text,
  evidence_note text,
  status text not null default 'new' check (status in ('new','imported','duplicate','not_fit')),
  is_simulated boolean not null default false
);

create table if not exists lead_candidates (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  brand_name text not null,
  sector text,
  contact_name text,
  contact_email text,
  contact_title text,
  source_channel text not null,
  signal_tag text,
  peer_sponsor_id uuid references peer_fest_sponsors(id) on delete set null,
  status text not null default 'new' check (status in ('new','duplicate','not_fit','assigned')),
  assigned_brand_id uuid references brands(id) on delete set null,
  import_batch text,
  created_at timestamptz not null default now()
);

-- ---------- brands ----------
alter table brands add column if not exists signal_tag text;
alter table brands add column if not exists agency_commission_pct numeric not null default 0;
alter table brands add column if not exists peer_fest_id uuid references peer_fests(id) on delete set null;
alter table brands add column if not exists peer_sponsor_id uuid references peer_fest_sponsors(id) on delete set null;

alter table brands drop constraint if exists brands_channel_chk;
alter table brands add constraint brands_channel_chk check (
  source_channel is null or source_channel in (
    'past_sponsors','other_fest','artist_linked','agency','csr','new_local','ipl_sports',
    'institute','cold_database','inbound_referral','peer_fest','next_year','creator_referral'
  )
);

alter table brands drop constraint if exists brands_signal_chk;
alter table brands add constraint brands_signal_chk check (
  signal_tag is null or signal_tag in (
    'new_store','product_launch','artist_concert','next_year','alumni_acr','dean','director',
    'agency','creator_referral','signed_sponsor_intro','peer_fest'
  )
);

-- ---------- deals ----------
update deals set payment_terms = '75_25' where payment_terms is null;
alter table deals alter column payment_terms set default '75_25';
alter table deals alter column payment_terms set not null;

alter table deals add column if not exists terms_status text not null default 'auto';
alter table deals drop constraint if exists deals_terms_status_chk;
alter table deals add constraint deals_terms_status_chk check (terms_status in ('auto','pending_approval','approved','rejected'));
alter table deals add column if not exists terms_approved_by uuid references team_members(id) on delete set null;
alter table deals add column if not exists terms_approved_at timestamptz;
alter table deals add column if not exists mou_sent_at timestamptz;

-- backfill MoU dates for confirmed Saarang deals (seeding flag keeps triggers quiet)
select set_config('app.seeding', 'on', true);
update deals
   set mou_signed_at = coalesce(mou_signed_at, (coalesce(stage_changed_at, created_at, now()) at time zone 'Asia/Kolkata')::date)
 where stage = 'partner_confirmed' and event_id = 'saarang-2027' and mou_signed_at is null;
select set_config('app.seeding', 'off', true);

-- MoU is required to confirm a Saarang deal. NOT VALID: CampusFest history is exempt.
alter table deals drop constraint if exists deals_confirmed_needs_mou_chk;
alter table deals add constraint deals_confirmed_needs_mou_chk
  check (stage <> 'partner_confirmed' or mou_signed_at is not null or event_id <> 'saarang-2027') not valid;

create table if not exists deal_items (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  catalog_id uuid references deliverable_catalog(id) on delete set null,
  name text not null,
  category text,
  list_price_inr bigint not null default 0,
  price_inr bigint not null default 0,
  is_custom boolean not null default false,
  is_ugc boolean not null default false
);
create index if not exists deal_items_deal_idx on deal_items(deal_id);

create table if not exists mous (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null unique references deals(id) on delete cascade,
  brand_name text not null,
  brand_address text,
  signatory_name text,
  signatory_designation text,
  tagline text,
  gstin text,
  signed_on date,
  prefest_due_on date,
  fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- activities, tasks, email_drafts ----------
alter table activities drop constraint if exists activities_event_type_check;
alter table activities add constraint activities_event_type_check check (event_type in (
  'outreach_sent','delivered','replied','meeting_booked','meeting_held','opt_out','introduction_received',
  'web_inbound','note','call_attempt','mail_sent','follow_up','status_change','intro_ask','intro_given'
));

alter table tasks drop constraint if exists tasks_source_check;
alter table tasks add constraint tasks_source_check check (
  source in ('manual','stale_rule','chatbot','head_decision','sequence','peer_fest','copilot')
);

alter table email_drafts add column if not exists scheduled_for date;

-- ---------- RLS on, no policies (service role only), same as the rest ----------
alter table peer_fests enable row level security;
alter table peer_fest_sponsors enable row level security;
alter table lead_candidates enable row level security;
alter table deal_items enable row level security;
alter table mous enable row level security;

-- ---------- triggers: understand mou_sent ----------
create or replace function public.deals_before() returns trigger language plpgsql as $f$
begin
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    new.stage_changed_at := now();
    if new.stage = 'mou_sent' and new.mou_sent_at is null then new.mou_sent_at := now(); end if;
  end if;
  return new;
end $f$;

create or replace function public.brands_after_upd() returns trigger language plpgsql as $f$
declare v_ik bigint;
begin
  if current_setting('app.seeding', true) = 'on' then return new; end if;
  if new.crm_status is distinct from old.crm_status then
    insert into status_events(event_id, brand_id, owner_id, from_status, to_status, occurred_at)
    values (new.event_id, new.id, new.owner_id, old.crm_status, new.crm_status, now());

    if new.crm_status = 'prospective' then
      if not exists (select 1 from deals d where d.brand_id = new.id
                     and d.stage in ('prospecting','contacted','proposal_sent','negotiating','mou_sent')) then
        insert into deals(event_id, brand_id, owner_id, name, stage, proposed_value_inr)
        values (new.event_id, new.id, new.owner_id, new.name || ' festival partnership',
                'prospecting', coalesce(new.approx_amount_inr, 0));
      end if;
    elsif new.crm_status = 'converted' then
      v_ik := least(coalesce(new.final_in_kind_inr, 0), coalesce(new.final_amount_inr, 0));
      update deals set stage = 'partner_confirmed',
             signed_value_inr = coalesce(new.final_amount_inr, 0),
             signed_in_kind_inr = v_ik,
             signed_cash_inr = coalesce(new.final_amount_inr, 0) - v_ik,
             mou_signed_at = coalesce(mou_signed_at, (now() at time zone 'Asia/Kolkata')::date)
       where brand_id = new.id and stage in ('prospecting','contacted','proposal_sent','negotiating','mou_sent');
      if not found then
        insert into deals(event_id, brand_id, owner_id, name, stage, proposed_value_inr,
                          signed_value_inr, signed_in_kind_inr, signed_cash_inr, mou_signed_at)
        values (new.event_id, new.id, new.owner_id, new.name || ' festival partnership',
                'partner_confirmed', coalesce(new.approx_amount_inr, 0),
                coalesce(new.final_amount_inr, 0), v_ik, coalesce(new.final_amount_inr, 0) - v_ik,
                (now() at time zone 'Asia/Kolkata')::date);
      end if;
    elsif new.crm_status = 'rejected' then
      update deals set stage = 'lost', lost_reason = new.rejection_reason
       where brand_id = new.id and stage in ('prospecting','contacted','proposal_sent','negotiating','mou_sent');
    end if;
  end if;
  return new;
end $f$;

-- ---------- views ----------
create or replace view v_deal_desk as
 select d.id as deal_id, d.event_id, d.brand_id, b.name as company, b.owner_id, d.stage,
        coalesce(d.proposed_value_inr, 0::bigint) as proposed_inr,
        d.next_follow_up,
        coalesce(b.last_touch_at, d.stage_changed_at, d.created_at) as last_touch,
        business_days_between(coalesce(b.last_touch_at, d.stage_changed_at, d.created_at), coalesce(e.as_of, now()), d.event_id) as idle_bdays,
        (select count(*) from activities a
          where a.brand_id = b.id and a.event_type = 'follow_up'
            and a.occurred_at > coalesce(d.created_at, '-infinity'::timestamptz)) as nudges
   from deals d
   join brands b on b.id = d.brand_id
   join events e on e.id = d.event_id
  where d.stage = any (array['prospecting'::deal_stage,'proposal_sent'::deal_stage,'negotiating'::deal_stage,'mou_sent'::deal_stage])
    and b.crm_status is not null;

create or replace view v_warmth_funnel as
 select event_id,
        case
          when signal_tag in ('new_store','product_launch','artist_concert') then 'other'
          when source_channel in ('past_sponsors','other_fest','artist_linked','inbound_referral','institute','peer_fest','next_year','creator_referral')
            or signal_tag in ('peer_fest','next_year','alumni_acr','dean','director','creator_referral','signed_sponsor_intro') then 'warm'
          else 'other'
        end as warmth,
        count(*) as companies,
        count(*) filter (where crm_status = any (array['to_contact','send_mail'])) as queued,
        count(*) filter (where first_outreach_at is not null) as outreached,
        count(*) filter (where first_response_at is not null) as responded,
        count(*) filter (where exists (select 1 from status_events s where s.brand_id = b.id and s.to_status = any (array['prospective','converted']))) as prospective_or_better,
        count(*) filter (where crm_status = 'converted') as converted
   from brands b
  where crm_status is not null
  group by event_id,
        case
          when signal_tag in ('new_store','product_launch','artist_concert') then 'other'
          when source_channel in ('past_sponsors','other_fest','artist_linked','inbound_referral','institute','peer_fest','next_year','creator_referral')
            or signal_tag in ('peer_fest','next_year','alumni_acr','dean','director','creator_referral','signed_sponsor_intro') then 'warm'
          else 'other'
        end;

notify pgrst, 'reload schema';