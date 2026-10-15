grant execute on function private.current_user_can_read_project_kanban(uuid) to anon;

drop policy if exists "project activity readable" on public.project_activity_feed;
create policy "project activity readable"
on public.project_activity_feed for select
to anon,authenticated
using (
  (select private.current_user_can_read_project_activity(project_id))
  and (
    event_type not like 'kanban_%'
    or (select private.current_user_can_read_project_kanban(project_id))
  )
);
