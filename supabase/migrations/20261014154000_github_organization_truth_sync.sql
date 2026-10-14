alter table public.github_org_membership_requests
  add column if not exists github_invitation_id bigint,
  add column if not exists github_invitation_created_at timestamptz,
  add column if not exists last_github_sync_at timestamptz;

create table if not exists public.github_org_sync_state (
  organization text primary key,
  installation_id bigint,
  members_count integer not null default 0,
  invitations_count integer not null default 0,
  sync_status text not null default 'pending'
    check (sync_status in ('pending','ok','error')),
  last_error text,
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.github_org_sync_state enable row level security;

create index if not exists github_org_membership_requests_org_status_idx
  on public.github_org_membership_requests(organization,status);

create index if not exists github_org_membership_requests_github_username_idx
  on public.github_org_membership_requests(lower(github_username));
