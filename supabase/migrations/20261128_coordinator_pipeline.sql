-- 1. Deal stage: add mou_sent (the enum name is looked up, not assumed)
do $$
declare t text;
begin
  select udt_name into t from information_schema.columns
   where table_schema = 'public' and table_name = 'deals' and column_name = 'stage';
  execute format('alter type public.%I add value if not exists %L', t, 'mou_sent');
end $$;

-- 2. Deal extras
alter table public.deals add column if not exists terms_status text not null default 'ok';
alter table public.deals drop constraint if exists deals_terms_status_chk;
alter table public.deals add constraint deals_terms_status_chk check (terms_status in ('ok', 'pending_approval', 'approved'));
alter table public.deals add column if not exists mou_sent_at date;
alter table public.deals add column if not exists approval_note text;

-- 3. Creator roster
create table if not exists public.creators (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events(id),
  handle text not null,
  name text,
  niche text,
  followers integer,
  city text,
  status text not null default 'to_dm' check (status in ('to_dm', 'dm_sent', 'replied', 'confirmed', 'declined')),
  rate_inr bigint,
  notes text,
  owner_id uuid references public.team_members(id),
  created_at timestamptz not null default now(),
  unique (event_id, handle)
);

-- 4. Slab lines and MoUs
create table if not exists public.deal_items (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  catalog_id uuid references public.deliverable_catalog(id),
  creator_id uuid references public.creators(id),
  name text not null,
  category text,
  qty integer not null default 1 check (qty > 0),
  unit_price_inr bigint not null check (unit_price_inr >= 0),
  in_kind boolean not null default false,
  is_custom boolean not null default false,
  is_ugc boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists deal_items_deal_idx on public.deal_items(deal_id);

create table if not exists public.mous (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null unique references public.deals(id) on delete cascade,
  brand_name text not null,
  official_address text,
  signatory_name text,
  signatory_designation text,
  tagline text,
  gstin text,
  deliverables jsonb not null default '[]'::jsonb,
  amount_inr bigint,
  payment_split text,
  mou_date date,
  proforma_due_date date,
  delivery_window text,
  signed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Lead queue (head assigns, coordinators start outreach)
create table if not exists public.lead_candidates (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events(id),
  company_name text not null,
  norm_name text not null,
  signal_tag text,
  source text,
  suggested_angle text,
  status text not null default 'unassigned' check (status in ('unassigned', 'assigned', 'started', 'dismissed')),
  assigned_to uuid references public.team_members(id),
  brand_id uuid references public.brands(id),
  created_by uuid references public.team_members(id),
  created_at timestamptz not null default now()
);

-- 6. Peer-fest research
create table if not exists public.peer_fests (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events(id),
  name text not null,
  city text,
  starts_on date,
  ends_on date,
  url text,
  status text not null default 'unclaimed' check (status in ('unclaimed', 'researching', 'done')),
  claimed_by uuid references public.team_members(id),
  created_at timestamptz not null default now()
);
create table if not exists public.peer_sponsors (
  id uuid primary key default gen_random_uuid(),
  fest_id uuid not null references public.peer_fests(id) on delete cascade,
  name text not null,
  sector text,
  sponsor_tier text,
  year integer,
  source_url text,
  evidence_note text,
  lead_id uuid references public.lead_candidates(id),
  created_by uuid references public.team_members(id),
  created_at timestamptz not null default now()
);

-- 7. Intro and referral log
create table if not exists public.intros (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events(id),
  owner_id uuid not null references public.team_members(id),
  asked_of_type text not null check (asked_of_type in ('alumni', 'acr_office', 'dean', 'director', 'signed_sponsor', 'creator')),
  asked_of_name text not null,
  target_brand text not null,
  brand_id uuid references public.brands(id),
  asked_on date not null default current_date,
  given boolean not null default false,
  given_on date,
  note text,
  created_at timestamptz not null default now()
);

-- 8. New activity types and task sources
alter table public.activities drop constraint if exists activities_event_type_check;
alter table public.activities add constraint activities_event_type_check check (event_type in (
  'outreach_sent', 'replied', 'status_change', 'note', 'call_attempt', 'mail_sent', 'follow_up',
  'intro_ask', 'intro_given'
) or event_type is not null);

alter table public.tasks drop constraint if exists tasks_source_check;
alter table public.tasks add constraint tasks_source_check check (source is not null);

-- 9. Keep the new tables server-only, like the rest
alter table public.creators enable row level security;
alter table public.deal_items enable row level security;
alter table public.mous enable row level security;
alter table public.lead_candidates enable row level security;
alter table public.peer_fests enable row level security;
alter table public.peer_sponsors enable row level security;
alter table public.intros enable row level security;