-- Protect scheduled CreativeZone Security batch audits with an internal database-held token.
create table if not exists public.security_scheduler_credentials (
  id boolean primary key default true check (id = true),
  scheduler_secret text not null default replace(extensions.uuid_generate_v4()::text,'-',''),
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now()
);

alter table public.security_scheduler_credentials enable row level security;
revoke all on table public.security_scheduler_credentials from anon, authenticated;

drop policy if exists "security scheduler no direct access" on public.security_scheduler_credentials;
create policy "security scheduler no direct access"
on public.security_scheduler_credentials
for all
to anon, authenticated
using (false)
with check (false);

insert into public.security_scheduler_credentials(id)
values(true)
on conflict(id) do nothing;

do $$
declare
  v_job bigint;
begin
  select jobid into v_job
  from cron.job
  where jobname='creativezone-security-project-audits'
  limit 1;

  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;
end $$;

select cron.schedule(
  'creativezone-security-project-audits',
  '17 */6 * * *',
  $cron$
    select net.http_post(
      url := 'https://ljxbewukkvenwjnjjjyf.supabase.co/functions/v1/security-audit',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'X-CreativeZone-Scheduler',
        (select scheduler_secret from public.security_scheduler_credentials where id=true)
      ),
      body := '{"action":"batch"}'::jsonb,
      timeout_milliseconds := 55000
    );
  $cron$
);

comment on table public.security_scheduler_credentials is
  'Internal scheduler credential used only by pg_cron and the CreativeZone Security Edge Function.';
