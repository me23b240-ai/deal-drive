-- Deal Drive 002: status history, weekly targets, fact bank, gates, business days, status guards.
create table if not exists status_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  from_status text,
  to_status text not null,
  occurred_at timestamptz not null default now(),
  member_id uuid references team_members(id) on delete set null,
  payload jsonb not null default '{}'::jsonb
);
create index if not exists status_events_brand_idx on status_events(brand_id, occurred_at);

create table if not exists weekly_targets (
  event_id text not null references events(id) on delete cascade,
  member_id uuid not null references team_members(id) on delete cascade,
  week_start date not null,
  target integer not null,
  primary key (event_id, member_id, week_start)
);

create table if not exists fact_bank (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  category text not null,
  fact text not null,
  source text,
  year text,
  sector_tags text[] not null default array['all']::text[],
  needs_review boolean not null default false,
  is_active boolean not null default true
);

create table if not exists portfolio_gates (
  event_id text not null references events(id) on delete cascade,
  gate_on date not null,
  base_inr numeric not null,
  stretch_inr numeric not null,
  primary key (event_id, gate_on)
);

alter table status_events enable row level security;
alter table weekly_targets enable row level security;
alter table fact_bank enable row level security;
alter table portfolio_gates enable row level security;

-- Business days between (exclusive start, inclusive end): Mon-Fri minus holidays.
create or replace function business_days_between(p_start date, p_end date, p_event_id text)
returns integer
language sql
stable
as $$
  select count(*)::integer
  from generate_series((p_start + 1), p_end, interval '1 day') as g(d)
  where extract(isodow from g.d) between 1 and 5
    and not exists (
      select 1 from holidays h
      where h.event_id = p_event_id and h.on_date = g.d::date
    );
$$;

create or replace function is_business_day(p_date date, p_event_id text)
returns boolean
language sql
stable
as $$
  select extract(isodow from p_date) between 1 and 5
    and not exists (
      select 1 from holidays h
      where h.event_id = p_event_id and h.on_date = p_date
    );
$$;

create or replace function brands_status_before()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.crm_status is distinct from old.crm_status then
    if new.crm_status = 'didnt_pick' and old.crm_status not in ('to_contact', 'send_mail', 'didnt_pick') then
      raise exception using
        message = 'Didn''t Pick is only valid from To Contact, Send Mail, or Didn''t Pick',
        errcode = 'P0001';
    end if;
    if new.crm_status = 'ghosting' and old.crm_status not in ('contacted', 'prospective', 'ghosting') then
      raise exception using
        message = 'Ghosting is only valid from Contacted, Prospective, or Ghosting',
        errcode = 'P0001';
    end if;
    if new.crm_status in ('contacted', 'prospective', 'converted', 'rejected')
       and new.first_response_at is null then
      new.first_response_at := timezone('Asia/Kolkata', now());
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists brands_status_before_trg on brands;
create trigger brands_status_before_trg
before update on brands
for each row execute function brands_status_before();

create or replace function brands_status_after()
returns trigger
language plpgsql
as $$
begin
  if new.crm_status is distinct from old.crm_status then
    insert into status_events (event_id, brand_id, from_status, to_status, member_id)
    values (new.event_id, new.id, old.crm_status, new.crm_status, new.owner_member_id);

    if new.crm_status = 'prospective' then
      insert into deals (event_id, brand_id, stage, approx_amount_inr, owner_member_id, next_follow_up)
      select new.event_id, new.id, 'prospecting', new.approx_amount_inr, new.owner_member_id, new.next_follow_up
      where not exists (
        select 1 from deals d
        where d.brand_id = new.id and d.stage in ('prospecting', 'proposal_sent', 'negotiating')
      );
    end if;

    if new.crm_status = 'converted' then
      update deals
      set
        stage = 'partner_confirmed',
        signed_cash_inr = coalesce(new.final_amount_inr, 0) - coalesce(new.final_in_kind_inr, 0),
        signed_in_kind_inr = coalesce(new.final_in_kind_inr, 0),
        confirmed_at = coalesce(confirmed_at, timezone('Asia/Kolkata', now()))
      where brand_id = new.id
        and stage in ('prospecting', 'proposal_sent', 'negotiating', 'partner_confirmed');

      if not found then
        insert into deals (
          event_id, brand_id, stage, approx_amount_inr,
          signed_cash_inr, signed_in_kind_inr, owner_member_id, confirmed_at
        ) values (
          new.event_id, new.id, 'partner_confirmed', new.approx_amount_inr,
          coalesce(new.final_amount_inr, 0) - coalesce(new.final_in_kind_inr, 0),
          coalesce(new.final_in_kind_inr, 0),
          new.owner_member_id,
          timezone('Asia/Kolkata', now())
        );
      end if;
    end if;

    if new.crm_status = 'rejected' then
      update deals
      set stage = 'lost'
      where brand_id = new.id
        and stage in ('prospecting', 'proposal_sent', 'negotiating');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists brands_status_after_trg on brands;
create trigger brands_status_after_trg
after update on brands
for each row execute function brands_status_after();
