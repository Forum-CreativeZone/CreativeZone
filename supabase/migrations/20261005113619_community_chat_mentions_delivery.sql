
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
    select distinct match[1]
    from regexp_matches(new.content,'@([A-Za-z0-9_.-]{3,50})','g') as match
  loop
    select id into v_target
    from public.profiles
    where lower(username)=lower(v_username)
      and account_status='active'
    limit 1;

    if v_target is not null and v_target <> new.user_id then
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

create or replace function private.queue_email_notification()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_enabled boolean := false;
  v_email text;
begin
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
    else false
  end
  into v_enabled
  from public.account_settings s
  where s.user_id=new.user_id;

  if not coalesce(v_enabled,false) then
    return new;
  end if;

  select email into v_email from auth.users where id=new.user_id;
  if v_email is null then
    return new;
  end if;

  insert into private.notification_email_queue(
    notification_id,user_id,recipient_email,notification_type,payload
  ) values(new.id,new.user_id,v_email,new.type,new.data)
  on conflict(notification_id) do nothing;

  return new;
end;
$$;

create or replace function private.push_notification_webhook()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_enabled boolean := false;
  v_hook_token text;
begin
  select (
    case new.type
      when 'new_reply' then s.push_reply
      when 'topic_watch' then s.push_watch
      when 'mention' then s.push_mention
      when 'chat_mention' then s.push_mention
      when 'quote' then s.push_quote
      when 'reaction' then s.push_reaction
      when 'new_follower' then s.push_follower
      when 'direct_message' then s.push_dm
      when 'moderation' then s.push_moderation
      else false
    end
  ) and s.push_enabled
  into v_enabled
  from public.account_settings s
  where s.user_id=new.user_id;

  if not coalesce(v_enabled,false) then
    return new;
  end if;

  select decrypted_secret into v_hook_token
  from vault.decrypted_secrets
  where name='creativezone_push_webhook_token'
  order by created_at desc
  limit 1;

  if v_hook_token is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://ljxbewukkvenwjnjjjyf.supabase.co/functions/v1/send-push',
    body := jsonb_build_object('notification_id',new.id),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-CreativeZone-Hook',v_hook_token
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;
