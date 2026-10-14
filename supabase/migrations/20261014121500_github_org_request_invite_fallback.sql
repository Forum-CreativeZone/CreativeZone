alter table public.github_org_membership_requests
  add column if not exists invite_error text,
  add column if not exists invite_attempted_at timestamptz,
  add column if not exists github_membership_state text;

alter table public.github_org_membership_requests
  drop constraint if exists github_org_membership_requests_status_check;

alter table public.github_org_membership_requests
  add constraint github_org_membership_requests_status_check
  check (status in ('pending','approved','invited','declined','cancelled'));
