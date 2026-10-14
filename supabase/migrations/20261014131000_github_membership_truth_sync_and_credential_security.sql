alter table public.github_org_membership_requests
  add column if not exists github_membership_role text,
  add column if not exists membership_verified_at timestamptz;

alter table public.github_org_membership_requests
  drop constraint if exists github_org_membership_requests_status_check;

alter table public.github_org_membership_requests
  add constraint github_org_membership_requests_status_check
  check (status in ('pending','approved','invited','joined','declined','cancelled'));

revoke all on function public.get_github_user_credential(uuid) from public, anon, authenticated;
grant execute on function public.get_github_user_credential(uuid) to service_role;
