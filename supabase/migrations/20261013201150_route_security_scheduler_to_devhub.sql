do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='creativezone-security-project-audits' limit 1;
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
end $$;

select cron.schedule(
  'creativezone-security-project-audits',
  '17 */6 * * *',
  $cron$
    select net.http_post(
      url := 'https://ljxbewukkvenwjnjjjyf.supabase.co/functions/v1/github-security-scan',
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
