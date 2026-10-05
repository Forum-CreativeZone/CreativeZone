
alter table public.account_settings
  add column if not exists inapp_watch boolean not null default true,
  add column if not exists email_watch boolean not null default true,
  add column if not exists push_watch boolean not null default true;

grant select(inapp_watch,email_watch,push_watch)
  on public.account_settings to authenticated;
grant update(inapp_watch,email_watch,push_watch)
  on public.account_settings to authenticated;

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
