update public.membership_plans
set entitlements =
  coalesce(entitlements,'{}'::jsonb)
  || jsonb_build_object('animated_cover', id in ('pro','elite'))
where id in ('free','pro','elite');
