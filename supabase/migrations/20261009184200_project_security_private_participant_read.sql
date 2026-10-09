drop policy if exists "project participants read security state" on public.project_security_state;
create policy "project participants read security state"
on public.project_security_state
for select
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id=project_security_state.project_id
      and (
        p.owner_id=(select auth.uid())
        or exists (
          select 1 from public.project_members m
          where m.project_id=p.id
            and m.user_id=(select auth.uid())
            and m.status='active'
        )
      )
  )
);

drop policy if exists "project participants read security audits" on public.project_security_audits;
create policy "project participants read security audits"
on public.project_security_audits
for select
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id=project_security_audits.project_id
      and (
        p.owner_id=(select auth.uid())
        or exists (
          select 1 from public.project_members m
          where m.project_id=p.id
            and m.user_id=(select auth.uid())
            and m.status='active'
        )
      )
  )
);
