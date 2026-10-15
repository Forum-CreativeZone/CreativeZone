create table if not exists public.link_shield_cache (
  id uuid primary key default gen_random_uuid(),
  normalized_url text not null unique,
  domain text not null,
  verdict text not null default 'unknown'
    check (verdict in ('no_known_threat','malicious','suspicious','local_network','sensitive_url','unknown')),
  decision text not null default 'allow'
    check (decision in ('allow','warn','block')),
  risk_score integer not null default 0 check (risk_score between 0 and 100),
  threat_type text,
  providers jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  hit_count bigint not null default 1
);

create index if not exists link_shield_cache_expires_idx on public.link_shield_cache(expires_at);
create index if not exists link_shield_cache_domain_idx on public.link_shield_cache(domain);
create index if not exists link_shield_cache_decision_idx on public.link_shield_cache(decision, checked_at desc);

alter table public.link_shield_cache enable row level security;
revoke all on table public.link_shield_cache from anon, authenticated;
grant all on table public.link_shield_cache to service_role;
drop policy if exists "link shield cache edge only" on public.link_shield_cache;
create policy "link shield cache edge only" on public.link_shield_cache
for all to anon, authenticated using(false) with check(false);

create table if not exists public.link_shield_events (
  id uuid primary key default gen_random_uuid(),
  normalized_url text not null,
  domain text not null,
  context text not null default 'unknown',
  verdict text not null,
  decision text not null,
  risk_score integer not null default 0 check (risk_score between 0 and 100),
  user_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists link_shield_events_created_idx on public.link_shield_events(created_at desc);
create index if not exists link_shield_events_domain_idx on public.link_shield_events(domain, created_at desc);
create index if not exists link_shield_events_decision_idx on public.link_shield_events(decision, created_at desc);

alter table public.link_shield_events enable row level security;
revoke all on table public.link_shield_events from anon, authenticated;
grant all on table public.link_shield_events to service_role;
drop policy if exists "link shield events edge only" on public.link_shield_events;
create policy "link shield events edge only" on public.link_shield_events
for all to anon, authenticated using(false) with check(false);

create table if not exists public.link_shield_reports (
  id uuid primary key default gen_random_uuid(),
  normalized_url text not null,
  domain text not null,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null default 'suspected_malicious',
  details text not null default '',
  status text not null default 'pending'
    check(status in ('pending','reviewed','dismissed','confirmed')),
  safety_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists link_shield_reports_status_idx on public.link_shield_reports(status, created_at desc);
create index if not exists link_shield_reports_domain_idx on public.link_shield_reports(domain, created_at desc);
create unique index if not exists link_shield_reports_open_unique
  on public.link_shield_reports(reporter_id, normalized_url)
  where status='pending';

alter table public.link_shield_reports enable row level security;
revoke all on table public.link_shield_reports from anon, authenticated;
grant all on table public.link_shield_reports to service_role;
drop policy if exists "link shield reports edge only" on public.link_shield_reports;
create policy "link shield reports edge only" on public.link_shield_reports
for all to anon, authenticated using(false) with check(false);
