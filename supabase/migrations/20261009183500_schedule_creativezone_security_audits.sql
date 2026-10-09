-- Automatically re-audit public GitHub projects every six hours.
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
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"action":"batch"}'::jsonb,
      timeout_milliseconds := 55000
    );
  $cron$
);
