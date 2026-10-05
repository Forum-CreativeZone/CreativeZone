drop policy if exists "owners maintain projects" on public.projects;
create policy "owners maintain projects"
on public.projects for update to authenticated
using (owner_id=(select auth.uid()))
with check (owner_id=(select auth.uid()));
