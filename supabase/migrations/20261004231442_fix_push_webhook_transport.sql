create or replace function private.push_notification_webhook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean := false;
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

  if coalesce(v_enabled,false) then
    perform net.http_post(
      url := 'https://ljxbewukkvenwjnjjjyf.supabase.co/functions/v1/send-push',
      body := jsonb_build_object('notification_id',new.id),
      params := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json'),
      timeout_milliseconds := 5000
    );
  end if;

  return new;
end;
$$;
