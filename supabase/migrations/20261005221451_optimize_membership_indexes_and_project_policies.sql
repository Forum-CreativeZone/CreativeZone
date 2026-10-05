create index if not exists user_memberships_granted_by_idx
  on public.user_memberships(granted_by);

create index if not exists membership_upgrade_requests_reviewed_by_idx
  on public.membership_upgrade_requests(reviewed_by);

drop policy if exists "owners maintain projects" on public.projects;
drop policy if exists "system owner maintain all projects" on public.projects;
create policy "owners or system owner maintain projects"
on public.projects for update
to authenticated
using (
  owner_id=(select auth.uid())
  or private.is_system_owner((select auth.uid()))
)
with check (
  owner_id=(select auth.uid())
  or private.is_system_owner((select auth.uid()))
);

drop policy if exists "owners delete projects" on public.projects;
drop policy if exists "system owner delete any project" on public.projects;
create policy "owners or system owner delete projects"
on public.projects for delete
to authenticated
using (
  owner_id=(select auth.uid())
  or private.is_system_owner((select auth.uid()))
);
