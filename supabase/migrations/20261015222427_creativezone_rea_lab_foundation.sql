create table if not exists public.rea_lab_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  mode text not null default 'analyze'
    check (mode in ('analyze','behavior_spec','rebuild')),
  target_type text not null
    check (target_type in (
      'website','javascript','electron','dotnet','apk','native','wasm','sqlite',
      'har','firmware','pcap','evm','flutter','other'
    )),
  source_type text not null default 'url'
    check (source_type in ('url','github','upload')),
  target_reference text not null default '',
  question text not null default '' check (char_length(question) <= 4000),
  objective text not null default '' check (char_length(objective) <= 4000),
  visibility text not null default 'private'
    check (visibility in ('private','unlisted','public')),
  status text not null default 'queued'
    check (status in ('draft','queued','waiting_worker','running','completed','failed','cancelled')),
  plan_id text not null default 'free',
  priority integer not null default 0,
  options jsonb not null default '{}'::jsonb,
  result_summary text not null default '',
  result jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  worker_id text,
  worker_version text,
  rea_version text,
  error_text text not null default '' check (char_length(error_text) <= 4000),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rea_lab_jobs_user_created_idx
  on public.rea_lab_jobs(user_id,created_at desc);
create index if not exists rea_lab_jobs_status_priority_idx
  on public.rea_lab_jobs(status,priority desc,created_at asc);
create index if not exists rea_lab_jobs_project_idx
  on public.rea_lab_jobs(project_id,created_at desc);

alter table public.rea_lab_jobs enable row level security;

drop policy if exists "rea users read own jobs" on public.rea_lab_jobs;
create policy "rea users read own jobs"
on public.rea_lab_jobs for select to authenticated
using (
  user_id=(select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and (p.system_owner=true or p.role in ('admin','moderator'))
  )
);

drop policy if exists "rea users update own drafts" on public.rea_lab_jobs;
create policy "rea users update own drafts"
on public.rea_lab_jobs for update to authenticated
using (user_id=(select auth.uid()) and status in ('draft','queued','waiting_worker'))
with check (user_id=(select auth.uid()));

revoke insert,delete on public.rea_lab_jobs from anon,authenticated;
grant select,update on public.rea_lab_jobs to authenticated;
grant all on public.rea_lab_jobs to service_role;

create table if not exists public.rea_lab_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.rea_lab_jobs(id) on delete cascade,
  event_type text not null,
  message text not null default '' check (char_length(message) <= 2000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists rea_lab_events_job_idx
  on public.rea_lab_events(job_id,created_at asc);

alter table public.rea_lab_events enable row level security;

drop policy if exists "rea users read own job events" on public.rea_lab_events;
create policy "rea users read own job events"
on public.rea_lab_events for select to authenticated
using (
  exists (
    select 1 from public.rea_lab_jobs j
    where j.id=job_id
      and (
        j.user_id=(select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id=(select auth.uid()) and (p.system_owner=true or p.role in ('admin','moderator'))
        )
      )
  )
);

revoke insert,update,delete on public.rea_lab_events from anon,authenticated;
grant select on public.rea_lab_events to authenticated;
grant all on public.rea_lab_events to service_role;

create table if not exists public.rea_lab_specs (
  job_id uuid primary key references public.rea_lab_jobs(id) on delete cascade,
  behavior_spec jsonb not null default '{}'::jsonb,
  implementation_plan jsonb not null default '{}'::jsonb,
  compatibility_tests jsonb not null default '[]'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.rea_lab_specs enable row level security;

drop policy if exists "rea users read own specs" on public.rea_lab_specs;
create policy "rea users read own specs"
on public.rea_lab_specs for select to authenticated
using (
  exists (
    select 1 from public.rea_lab_jobs j
    where j.id=job_id
      and (
        j.user_id=(select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id=(select auth.uid()) and (p.system_owner=true or p.role in ('admin','moderator'))
        )
      )
  )
);

revoke all on public.rea_lab_specs from anon,authenticated;
grant select on public.rea_lab_specs to authenticated;
grant all on public.rea_lab_specs to service_role;

update public.membership_plans
set entitlements=jsonb_set(
  entitlements,
  '{rea_lab}',
  '{
    "enabled": true,
    "monthly_runs": 1,
    "max_upload_mb": 25,
    "modes": ["analyze"],
    "target_types": ["website","javascript","dotnet","wasm"],
    "behavior_spec": false,
    "rebuild": false,
    "priority_queue": false,
    "project_integration": false,
    "advanced_providers": false
  }'::jsonb,
  true
)
where id='free';

update public.membership_plans
set entitlements=jsonb_set(
  entitlements,
  '{rea_lab}',
  '{
    "enabled": true,
    "monthly_runs": 8,
    "max_upload_mb": 250,
    "modes": ["analyze","behavior_spec"],
    "target_types": ["website","javascript","electron","dotnet","apk","wasm","sqlite","har"],
    "behavior_spec": true,
    "rebuild": false,
    "priority_queue": false,
    "project_integration": true,
    "advanced_providers": false
  }'::jsonb,
  true
)
where id='pro';

update public.membership_plans
set entitlements=jsonb_set(
  entitlements,
  '{rea_lab}',
  '{
    "enabled": true,
    "monthly_runs": 25,
    "max_upload_mb": 1024,
    "modes": ["analyze","behavior_spec","rebuild"],
    "target_types": ["website","javascript","electron","dotnet","apk","native","wasm","sqlite","har","firmware","pcap","evm","flutter","other"],
    "behavior_spec": true,
    "rebuild": true,
    "priority_queue": true,
    "project_integration": true,
    "advanced_providers": true
  }'::jsonb,
  true
)
where id='elite';

comment on table public.rea_lab_jobs is
  'CreativeZone REA Lab analysis/rebuild jobs. Execution is performed by an isolated external worker, never inside the forum web process.';
comment on table public.rea_lab_specs is
  'Behavior specification, independent implementation plan, compatibility tests and provenance produced by REA Lab.';
