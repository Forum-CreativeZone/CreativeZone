
create or replace function private.notify_chat_mentions()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_username text;
  v_target uuid;
begin
  if new.deleted_at is not null then return new; end if;

  for v_username in
    select distinct coalesce(match[1],match[2])
    from regexp_matches(
      new.content,
      '@\[([^\]]{2,80})\]|@([A-Za-z0-9_.-]{3,50})',
      'g'
    ) as match
  loop
    select id into v_target
    from public.profiles
    where lower(username)=lower(v_username)
      and account_status='active'
    limit 1;

    if v_target is not null
      and v_target <> new.user_id
      and not exists (
        select 1
        from public.ignores i
        where i.blocker_id=v_target
          and i.ignored_id=new.user_id
      )
    then
      insert into public.notifications(user_id,actor_id,type,data)
      values(
        v_target,
        new.user_id,
        'chat_mention',
        jsonb_build_object(
          'chat_message_id',new.id,
          'message',left(new.content,500),
          'path','/'
        )
      );
    end if;
  end loop;

  return new;
end;
$$;
