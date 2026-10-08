alter table public.topic_watches
  add column if not exists email_notifications boolean not null default true;

drop policy if exists "users update own topic watches" on public.topic_watches;
create policy "users update own topic watches"
on public.topic_watches
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create or replace function private.queue_email_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean := false;
  v_email text;
  v_watch_email boolean := true;
  v_topic_id uuid;
begin
  if new.type = 'topic_watch' and nullif(new.data->>'topic_id','') is not null then
    begin
      v_topic_id := (new.data->>'topic_id')::uuid;
    exception when others then
      v_topic_id := null;
    end;

    if v_topic_id is not null then
      select w.email_notifications
      into v_watch_email
      from public.topic_watches w
      where w.topic_id = v_topic_id
        and w.user_id = new.user_id
      limit 1;

      if not coalesce(v_watch_email,false) then
        return new;
      end if;
    end if;
  end if;

  select case new.type
    when 'new_reply' then s.email_reply
    when 'topic_watch' then s.email_watch
    when 'mention' then s.email_mention
    when 'chat_mention' then s.email_mention
    when 'quote' then s.email_quote
    when 'reaction' then s.email_reaction
    when 'new_follower' then s.email_follower
    when 'direct_message' then s.email_dm
    when 'moderation' then s.email_moderation
    when 'membership_granted' then s.email_membership
    when 'membership_expiring' then s.email_membership
    when 'membership_expired' then s.email_membership
    else false
  end
  into v_enabled
  from public.account_settings s
  where s.user_id = new.user_id;

  if not coalesce(v_enabled,false) then return new; end if;

  select email into v_email from auth.users where id = new.user_id;
  if v_email is null then return new; end if;

  insert into private.notification_email_queue(
    notification_id,user_id,recipient_email,notification_type,payload
  ) values(new.id,new.user_id,v_email,new.type,new.data)
  on conflict(notification_id) do nothing;

  return new;
end;
$$;
