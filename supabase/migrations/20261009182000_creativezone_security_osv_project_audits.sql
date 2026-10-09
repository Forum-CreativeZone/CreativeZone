-- CreativeZone Security: package vulnerability cache, project audits and public technical profile data.

alter table public.projects
  add column if not exists security_audit_enabled boolean not null default true;

create table if not exists public.security_package_cache (
  id uuid primary key default extensions.uuid_generate_v4(),
  cache_key text not null unique,
  ecosystem text not null,
  package_name text not null,
  version text not null,
  query jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  vulnerability_count integer not null default 0,
  critical_count integer not null default 0,
  high_count integer not null default 0,
  medium_count integer not null default 0,
  low_count integer not null default 0,
  highest_severity text not null default 'none'
    check (highest_severity in ('none','low','medium','high','critical','unknown')),
  checked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists security_package_cache_expires_idx
  on public.security_package_cache(expires_at);

create table if not exists public.project_security_audits (
  id uuid primary key default extensions.uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  trigger_type text not null default 'automatic'
    check (trigger_type in ('automatic','manual','scheduled')),
  requested_by uuid references public.profiles(id) on delete set null,
  status text not null default 'running'
    check (status in ('running','completed','partial','failed')),
  source text not null default 'github-sbom',
  repo_url text not null,
  repo_owner text,
  repo_name text,
  default_branch text,
  commit_sha text,
  manifest_files jsonb not null default '[]'::jsonb,
  dependency_count integer not null default 0,
  vulnerable_dependency_count integer not null default 0,
  vulnerability_count integer not null default 0,
  critical_count integer not null default 0,
  high_count integer not null default 0,
  medium_count integer not null default 0,
  low_count integer not null default 0,
  unknown_count integer not null default 0,
  highest_severity text not null default 'none'
    check (highest_severity in ('none','low','medium','high','critical','unknown')),
  security_score integer not null default 100
    check (security_score between 0 and 100),
  summary jsonb not null default '{}'::jsonb,
  findings jsonb not null default '[]'::jsonb,
  error_text text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists project_security_audits_project_time_idx
  on public.project_security_audits(project_id, started_at desc);

create table if not exists public.project_security_state (
  project_id uuid primary key references public.projects(id) on delete cascade,
  audit_id uuid references public.project_security_audits(id) on delete set null,
  status text not null default 'unknown'
    check (status in ('unknown','scanning','secure','attention','danger','error')),
  security_score integer not null default 100
    check (security_score between 0 and 100),
  dependency_count integer not null default 0,
  vulnerable_dependency_count integer not null default 0,
  vulnerability_count integer not null default 0,
  critical_count integer not null default 0,
  high_count integer not null default 0,
  medium_count integer not null default 0,
  low_count integer not null default 0,
  unknown_count integer not null default 0,
  highest_severity text not null default 'none'
    check (highest_severity in ('none','low','medium','high','critical','unknown')),
  manifest_count integer not null default 0,
  repo_commit_sha text,
  summary jsonb not null default '{}'::jsonb,
  last_audited_at timestamptz,
  next_scan_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_security_state_next_scan_idx
  on public.project_security_state(next_scan_at);

alter table public.security_package_cache enable row level security;
alter table public.project_security_audits enable row level security;
alter table public.project_security_state enable row level security;

revoke all on table public.security_package_cache from anon,authenticated;
revoke all on table public.project_security_audits from anon,authenticated;
revoke all on table public.project_security_state from anon,authenticated;

grant select on table public.project_security_audits to anon,authenticated;
grant select on table public.project_security_state to anon,authenticated;

drop policy if exists "public project security audits" on public.project_security_audits;
create policy "public project security audits"
on public.project_security_audits
for select
to anon,authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id=project_security_audits.project_id
      and p.visibility='public'
  )
);

drop policy if exists "public project security state" on public.project_security_state;
create policy "public project security state"
on public.project_security_state
for select
to anon,authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id=project_security_state.project_id
      and p.visibility='public'
  )
);

drop policy if exists "security package cache edge only" on public.security_package_cache;
create policy "security package cache edge only"
on public.security_package_cache
for all
to anon,authenticated
using (false)
with check (false);

create or replace function public.get_profile_audited_projects(p_user_id uuid)
returns table(
  id uuid,
  title text,
  slug text,
  summary text,
  status text,
  repo_url text,
  relationship text,
  security_status text,
  security_score integer,
  dependency_count integer,
  vulnerable_dependency_count integer,
  vulnerability_count integer,
  highest_severity text,
  last_audited_at timestamptz
)
language sql
stable
security invoker
set search_path=''
as $$
  with related as (
    select p.id,p.title,p.slug,p.summary,p.status,p.repo_url,'owner'::text as relationship
    from public.projects p
    where p.owner_id=p_user_id and p.visibility='public'
    union
    select p.id,p.title,p.slug,p.summary,p.status,p.repo_url,'member'::text
    from public.project_members m
    join public.projects p on p.id=m.project_id
    where m.user_id=p_user_id
      and m.status='active'
      and p.visibility='public'
      and p.owner_id is distinct from p_user_id
  )
  select
    r.id,r.title,r.slug,r.summary,r.status,r.repo_url,r.relationship,
    s.status as security_status,
    s.security_score,
    s.dependency_count,
    s.vulnerable_dependency_count,
    s.vulnerability_count,
    s.highest_severity,
    s.last_audited_at
  from related r
  join public.project_security_state s on s.project_id=r.id
  where s.last_audited_at is not null
  order by s.last_audited_at desc,r.title;
$$;

revoke all on function public.get_profile_audited_projects(uuid) from public;
grant execute on function public.get_profile_audited_projects(uuid) to anon,authenticated;

comment on table public.project_security_state is
  'Current CreativeZone Security posture for a project. Updated by the security-audit Edge Function.';
comment on table public.project_security_audits is
  'Immutable audit history produced from GitHub repository dependency data and OSV vulnerability data.';
comment on table public.security_package_cache is
  'Short-lived package/version vulnerability cache used by CreativeZone Security.';
