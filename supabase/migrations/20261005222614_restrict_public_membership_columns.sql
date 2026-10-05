revoke select on public.user_memberships from anon, authenticated;

grant select (
  user_id,
  plan_id,
  status,
  permanent,
  starts_at,
  ends_at
) on public.user_memberships to anon, authenticated;
