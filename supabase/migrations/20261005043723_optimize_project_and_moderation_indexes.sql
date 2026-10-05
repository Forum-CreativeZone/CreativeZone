
create index if not exists moderation_actions_moderator_id_idx
  on public.moderation_actions(moderator_id);
create index if not exists moderation_actions_report_id_idx
  on public.moderation_actions(report_id);
create index if not exists project_updates_author_id_idx
  on public.project_updates(author_id);
create index if not exists reports_reviewed_by_idx
  on public.reports(reviewed_by);

drop policy if exists "projects visible" on public.projects;
create policy "projects visible"
on public.projects for select
to public
using (
  visibility='public'
  or (select auth.uid()) is not null
);

drop policy if exists "project memberships visible" on public.project_members;
create policy "project memberships visible"
on public.project_members for select
to public
using (
  exists (
    select 1
    from public.projects p
    where p.id=project_members.project_id
      and (
        p.visibility='public'
        or (select auth.uid()) is not null
      )
  )
);

drop policy if exists "project updates visible" on public.project_updates;
create policy "project updates visible"
on public.project_updates for select
to public
using (
  exists (
    select 1
    from public.projects p
    where p.id=project_updates.project_id
      and (
        p.visibility='public'
        or (select auth.uid()) is not null
      )
  )
);
