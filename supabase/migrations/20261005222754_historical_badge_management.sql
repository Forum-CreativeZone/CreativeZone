revoke all on public.user_badges from anon, authenticated;
grant select on public.user_badges to anon, authenticated;

create or replace function public.manage_historical_badge(
  p_user_id uuid,
  p_badge_slug text,
  p_grant boolean default true
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_badge_id uuid;
begin
  select role into v_actor_role
  from public.profiles
  where id=v_actor;

  if v_actor is null or v_actor_role <> 'admin' then
    raise exception 'Admin access required';
  end if;

  if p_badge_slug not in ('beta-tester','pioneer-creativezone','early-supporter') then
    raise exception 'Esta insígnia não pode ser gerenciada manualmente.';
  end if;

  select id into v_badge_id
  from public.badges
  where slug=p_badge_slug;

  if v_badge_id is null then
    raise exception 'Insígnia não encontrada.';
  end if;

  if not exists(select 1 from public.profiles where id=p_user_id) then
    raise exception 'Membro não encontrado.';
  end if;

  if p_grant then
    insert into public.user_badges(user_id,badge_id)
    values(p_user_id,v_badge_id)
    on conflict do nothing;
  else
    delete from public.user_badges
    where user_id=p_user_id and badge_id=v_badge_id;
  end if;

  insert into public.moderation_actions(
    moderator_id,action_type,target_type,target_id,reason
  )
  values(
    v_actor,
    case when p_grant then 'badge_grant' else 'badge_revoke' end,
    'profile',
    p_user_id,
    p_badge_slug
  );
end;
$$;

revoke all on function public.manage_historical_badge(uuid,text,boolean) from public,anon;
grant execute on function public.manage_historical_badge(uuid,text,boolean)
to authenticated,service_role;
