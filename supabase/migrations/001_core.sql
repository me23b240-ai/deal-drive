-- Deal Drive 001: core tables, enums-as-text, RLS (no policies; service role bypasses RLS).
create extension if not exists pgcrypto;

create table if not exists events (
  id text primary key,
  name text not null,
  city text,
  starts timestamptz not null,
  ends timestamptz not null,
  as_of timestamptz,
  is_seed boolean not null default false,
  weekly_target_default integer not null default 10,
  model_assumptions jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  name text not null,
  role text not null check (role in ('manager', 'coordinator')),
  email text,
  phone text,
  is_closer boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists team_members_event_idx on team_members(event_id);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  kind text not null check (kind in ('channel', 'initiative')),
  source_id text not null,
  name text not null,
  budget_inr numeric not null default 0,
  spend_inr numeric not null default 0,
  owner_member_id uuid references team_members(id) on delete set null,
  starts date,
  ends date,
  kpis jsonb not null default '{}'::jsonb,
  scale_rule jsonb,
  change_rule jsonb,
  stop_rule jsonb,
  expected_stretch_inr numeric,
  extra jsonb not null default '{}'::jsonb,
  unique (event_id, kind, source_id)
);

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  name text not null,
  source_id text,
  source_channel text,
  initiative_id text,
  sector text,
  company_tier text check (company_tier in ('large', 'medium', 'small')),
  is_club_deal boolean not null default false,
  crm_status text not null,
  owner_member_id uuid references team_members(id) on delete set null,
  approx_amount_inr numeric,
  final_amount_inr numeric,
  final_in_kind_inr numeric,
  first_outreach_at timestamptz,
  first_response_at timestamptz,
  last_touch_at timestamptz,
  next_follow_up date,
  call_attempts integer not null default 0,
  rejected_reason text,
  notes text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists brands_event_status_idx on brands(event_id, crm_status);
create index if not exists brands_owner_idx on brands(owner_member_id);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  name text,
  role text,
  email text,
  phone text,
  is_primary boolean not null default false,
  source_id text,
  extra jsonb not null default '{}'::jsonb
);

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  brand_id uuid references brands(id) on delete cascade,
  member_id uuid references team_members(id) on delete set null,
  kind text not null,
  body text,
  occurred_at timestamptz not null default now(),
  source_id text,
  origin_activity_id text,
  attempt_id text,
  extra jsonb not null default '{}'::jsonb
);
create index if not exists activities_brand_idx on activities(brand_id, occurred_at desc);

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  stage text not null,
  approx_amount_inr numeric,
  signed_cash_inr numeric,
  signed_in_kind_inr numeric,
  owner_member_id uuid references team_members(id) on delete set null,
  next_follow_up date,
  notes text,
  nudge_count integer not null default 0,
  confirmed_at timestamptz,
  source_id text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists deals_event_stage_idx on deals(event_id, stage);

create table if not exists deal_history (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  stage text,
  value_inr numeric,
  support_type text,
  occurred_at timestamptz not null default now(),
  source_id text,
  extra jsonb not null default '{}'::jsonb
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  phase text not null check (phase in ('pre_fest', 'post_fest')),
  amount_inr numeric not null,
  due_on date not null,
  received_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists holidays (
  event_id text not null references events(id) on delete cascade,
  on_date date not null,
  name text,
  primary key (event_id, on_date)
);

create table if not exists stale_rules (
  event_id text not null references events(id) on delete cascade,
  status_key text not null,
  business_days integer not null,
  primary key (event_id, status_key)
);

create table if not exists targets (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  kind text not null check (kind in ('base', 'stretch')),
  signed_inr numeric not null,
  cash_inr numeric not null,
  source text
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  member_id uuid not null references team_members(id) on delete cascade,
  title text not null,
  due_on date,
  done boolean not null default false,
  brand_id uuid references brands(id) on delete set null,
  source text,
  created_at timestamptz not null default now()
);

create table if not exists eod_reports (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  member_id uuid not null references team_members(id) on delete cascade,
  on_date date not null,
  payload jsonb not null default '{}'::jsonb,
  note text,
  unique (event_id, member_id, on_date)
);

create table if not exists email_drafts (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  member_id uuid references team_members(id) on delete set null,
  step text not null check (step in ('initial', 'follow_up_1', 'follow_up_2')),
  personalised boolean not null default false,
  opening text,
  body text,
  facts_used jsonb,
  model text,
  template_version text,
  status text not null default 'draft' check (status in ('draft', 'sent')),
  warning text,
  created_at timestamptz not null default now()
);

create table if not exists packages (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  name text not null,
  price_inr numeric not null,
  headline text,
  sold boolean not null default false
);

create table if not exists deliverable_catalog (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  category text not null,
  name text not null,
  price_inr numeric,
  price_min_inr numeric,
  price_max_inr numeric,
  sold boolean not null default false
);

create table if not exists qualification_history (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  qualified boolean,
  occurred_at timestamptz not null default now(),
  source_id text,
  extra jsonb not null default '{}'::jsonb
);

create table if not exists sponsor_activations (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  brand_id uuid references brands(id) on delete set null,
  deal_id uuid references deals(id) on delete set null,
  name text,
  extra jsonb not null default '{}'::jsonb,
  source_id text
);

create table if not exists pending_actions (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  member_id uuid references team_members(id) on delete set null,
  tool text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  member_id uuid references team_members(id) on delete set null,
  filename text,
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists score_signals (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references events(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  signal text not null,
  weight numeric not null,
  extra jsonb not null default '{}'::jsonb
);

alter table events enable row level security;
alter table team_members enable row level security;
alter table campaigns enable row level security;
alter table brands enable row level security;
alter table contacts enable row level security;
alter table activities enable row level security;
alter table deals enable row level security;
alter table deal_history enable row level security;
alter table payments enable row level security;
alter table holidays enable row level security;
alter table stale_rules enable row level security;
alter table targets enable row level security;
alter table tasks enable row level security;
alter table eod_reports enable row level security;
alter table email_drafts enable row level security;
alter table packages enable row level security;
alter table deliverable_catalog enable row level security;
alter table qualification_history enable row level security;
alter table sponsor_activations enable row level security;
alter table pending_actions enable row level security;
alter table import_batches enable row level security;
alter table score_signals enable row level security;
