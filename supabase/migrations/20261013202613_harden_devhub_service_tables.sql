revoke all on public.github_installations from anon, authenticated;
drop policy if exists "github installations are service only" on public.github_installations;
create policy "github installations are service only" on public.github_installations for select to anon, authenticated using (false);
revoke insert, update, delete on public.project_security_reports from anon, authenticated;
revoke insert, update, delete on public.project_github_events from anon, authenticated;
revoke insert, update, delete on public.github_dependencies from anon, authenticated;
revoke insert, update, delete on public.github_vulnerabilities from anon, authenticated;
