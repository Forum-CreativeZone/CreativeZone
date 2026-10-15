select private.sync_project_github_event_activity(e)
from public.project_github_events e
where e.project_id is not null
  and e.event_type='issues'
  and e.received_at>=now()-interval '180 days';
