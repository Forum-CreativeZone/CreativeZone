create index if not exists notifications_unread_user_created_idx
  on public.notifications(user_id,created_at desc)
  where read=false;

create or replace function public.get_unread_notification_count()
returns integer
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_count integer := 0;
begin
  if v_user is null then
    return 0;
  end if;

  select count(*)::integer
    into v_count
  from public.notifications n
  left join public.account_settings s on s.user_id=v_user
  where n.user_id=v_user
    and n.read=false
    and case n.type
      when 'new_reply' then coalesce(s.inapp_reply,true)
      when 'topic_watch' then coalesce(s.inapp_watch,true)
      when 'mention' then coalesce(s.inapp_mention,true)
      when 'chat_mention' then coalesce(s.inapp_mention,true)
      when 'quote' then coalesce(s.inapp_quote,true)
      when 'reaction' then coalesce(s.inapp_reaction,true)
      when 'new_follower' then coalesce(s.inapp_follower,true)
      when 'direct_message' then coalesce(s.inapp_dm,true)
      when 'moderation' then coalesce(s.inapp_moderation,true)
      else true
    end;

  return coalesce(v_count,0);
end;
$$;

revoke all on function public.get_unread_notification_count() from public,anon;
grant execute on function public.get_unread_notification_count() to authenticated;
