create or replace function private.adjust_reputation_from_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid;
  v_total bigint;
  v_owner boolean;
begin
  v_user := case when tg_op='INSERT' then new.user_id else old.user_id end;

  select coalesce(system_owner,false)
  into v_owner
  from public.profiles
  where id=v_user;

  if coalesce(v_owner,false) then
    update public.profiles
    set reputation=1000000,
        updated_at=now()
    where id=v_user;
  else
    select coalesce(sum(e.points),0)
    into v_total
    from public.reputation_events e
    where e.user_id=v_user;

    update public.profiles
    set reputation=least(1000000,greatest(0,v_total))::integer,
        updated_at=now()
    where id=v_user;
  end if;

  perform private.award_gamification_badges(v_user);
  return coalesce(new,old);
end;
$$;

revoke all on function private.adjust_reputation_from_event() from public,anon,authenticated;

update public.profiles
set reputation=1000000,updated_at=now()
where system_owner=true;
