drop policy if exists "github org requests own read" on public.github_org_membership_requests;
drop policy if exists "github org requests staff read" on public.github_org_membership_requests;

create policy "github org requests readable"
on public.github_org_membership_requests
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and (p.system_owner = true or p.role in ('admin','moderator'))
  )
);
