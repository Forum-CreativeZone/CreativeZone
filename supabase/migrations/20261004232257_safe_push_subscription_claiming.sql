create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_device_id text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if p_endpoint is null or p_p256dh is null or p_auth is null then
    raise exception 'Invalid push subscription';
  end if;

  delete from public.push_subscriptions
  where endpoint=p_endpoint and user_id<>v_user;

  insert into public.push_subscriptions(
    user_id,device_id,endpoint,p256dh,auth,user_agent,updated_at
  )
  values(
    v_user,p_device_id,p_endpoint,p_p256dh,p_auth,p_user_agent,now()
  )
  on conflict(endpoint) do update set
    user_id=excluded.user_id,
    device_id=excluded.device_id,
    p256dh=excluded.p256dh,
    auth=excluded.auth,
    user_agent=excluded.user_agent,
    updated_at=now();
end;
$$;

revoke all on function public.register_push_subscription(text,text,text,text,text)
from public, anon;
grant execute on function public.register_push_subscription(text,text,text,text,text)
to authenticated;
