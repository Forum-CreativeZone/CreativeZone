
drop policy if exists "members request project participation" on public.project_members;
create policy "members request project participation"
on public.project_members for insert to authenticated
with check (
  user_id=(select auth.uid())
  and role='interested'
  and status='pending'
  and exists (
    select 1
    from public.projects p
    where p.id=project_id
      and p.status <> 'archived'
  )
);

drop policy if exists "active project members post updates" on public.project_updates;
create policy "active project members post updates"
on public.project_updates for insert to authenticated
with check (
  author_id=(select auth.uid())
  and exists (
    select 1
    from public.projects p
    where p.id=project_id
      and p.status <> 'archived'
      and (
        p.owner_id=(select auth.uid())
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id=project_updates.project_id
            and pm.user_id=(select auth.uid())
            and pm.status='active'
            and pm.role in ('maintainer','contributor')
        )
      )
  )
);
