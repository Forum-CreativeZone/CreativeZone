create table if not exists public.github_connections (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 github_username text, installation_id bigint, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id)
);
alter table public.github_connections enable row level security;

create table if not exists public.project_repositories (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 repository_provider text not null default 'github', repo_owner text not null, repo_name text not null, repo_url text not null,
 default_branch text default 'main', last_sync_at timestamptz, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.project_repositories enable row level security;

create table if not exists public.project_security_reports (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 repository_id uuid references public.project_repositories(id) on delete cascade, plan_feature text not null default 'security_scan',
 scan_type text not null default 'manual', status text not null default 'queued', dependency_count integer not null default 0,
 vulnerability_count integer not null default 0, critical_count integer not null default 0, high_count integer not null default 0,
 medium_count integer not null default 0, low_count integer not null default 0, sbom jsonb not null default '{}'::jsonb,
 findings jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), completed_at timestamptz
);
alter table public.project_security_reports enable row level security;

create table if not exists public.project_github_events (
 id uuid primary key default gen_random_uuid(), project_id uuid references public.projects(id) on delete cascade,
 event_type text not null, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table public.project_github_events enable row level security;
