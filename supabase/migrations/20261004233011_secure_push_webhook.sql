do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name='creativezone_push_webhook_token'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32),'hex'),
      'creativezone_push_webhook_token',
      'Internal token for notification trigger to Web Push Edge Function'
    );
  end if;
end $$;

create or replace function public.get_push_webhook_token()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name='creativezone_push_webhook_token'
  order by created_at desc
  limit 1;
$$;
revoke all on function public.get_push_webhook_token() from public, anon, authenticated;
grant execute on function public.get_push_webhook_token() to service_role;

create or replace function private.push_notification_webhook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean := false;
  v_hook_token text;
begin
  select (
    case new.type
      when 'new_reply' then s.push_reply
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
