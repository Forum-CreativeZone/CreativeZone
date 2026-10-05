alter table private.notification_email_queue
  add column if not exists attempts integer not null default 0,
  add column if not exists provider_email_id text,
  add column if not exists error_message text,
  add column if not exists last_attempt_at timestamptz;

do $$ begin
  alter table private.notification_email_queue
    add constraint notification_email_queue_status_check
    check (status in ('pending','sending','sent','failed'));
exception when duplicate_object then null; end $$;

do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name='creativezone_email_webhook_token'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32),'hex'),
      'creativezone_email_webhook_token',
      'Internal token for CreativeZone email queue webhook'
    );
  end if;
end $$;

create or replace function public.get_creativezone_email_webhook_token()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name='creativezone_email_webhook_token'
  order by created_at desc
  limit 1;
$$;
revoke all on function public.get_creativezone_email_webhook_token() from public, anon, authenticated;
grant execute on function public.get_creativezone_email_webhook_token() to service_role;

create or replace function public.get_creativezone_resend_api_key()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name='creativezone_resend_api_key'
  order by created_at desc
  limit 1;
$$;
revoke all on function public.get_creativezone_resend_api_key() from public, anon, authenticated;
grant execute on function public.get_creativezone_resend_api_key() to service_role;

create or replace function public.get_creativezone_resend_from()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name='creativezone_resend_from'
  order by created_at desc
  limit 1;
$$;
revoke all on function public.get_creativezone_resend_from() from public, anon, authenticated;
grant execute on function public.get_creativezone_resend_from() to service_role;

create or replace function public.get_creativezone_resend_reply_to()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name='creativezone_resend_reply_to'
  order by created_at desc
  limit 1;
$$;
revoke all on function public.get_creativezone_resend_reply_to() from public, anon, authenticated;
grant execute on function public.get_creativezone_resend_reply_to() to service_role;

create or replace function private.dispatch_email_queue_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hook_token text;
begin
  select decrypted_secret into v_hook_token
  from vault.decrypted_secrets
  where name='creativezone_email_webhook_token'
  order by created_at desc
  limit 1;

  if v_hook_token is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://ljxbewukkvenwjnjjjyf.supabase.co/functions/v1/send-community-email',
    body := jsonb_build_object('queue_id',new.id),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-CreativeZone-Email-Hook',v_hook_token
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists dispatch_email_queue_insert on private.notification_email_queue;
create trigger dispatch_email_queue_insert
after insert on private.notification_email_queue
for each row execute function private.dispatch_email_queue_row();

create or replace function private.dispatch_pending_email_queue()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hook_token text;
  row_item record;
begin
  select decrypted_secret into v_hook_token
  from vault.decrypted_secrets
  where name='creativezone_email_webhook_token'
  order by created_at desc
  limit 1;

  if v_hook_token is null then
    return;
  end if;

  for row_item in
    select id
    from private.notification_email_queue
    where status in ('pending','failed')
      and attempts < 5
      and (last_attempt_at is null or last_attempt_at < now() - interval '5 minutes')
    order by created_at
    limit 25
  loop
    perform net.http_post(
      url := 'https://ljxbewukkvenwjnjjjyf.supabase.co/functions/v1/send-community-email',
      body := jsonb_build_object('queue_id',row_item.id),
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'X-CreativeZone-Email-Hook',v_hook_token
      ),
      timeout_milliseconds := 5000
    );
  end loop;
end;
$$;

create extension if not exists pg_cron with schema extensions;

do $$
begin
  if not exists (select 1 from cron.job where jobname='creativezone-retry-community-emails') then
    perform cron.schedule(
      'creativezone-retry-community-emails',
      '*/5 * * * *',
      'select private.dispatch_pending_email_queue();'
    );
  end if;
end $$;
