drop policy if exists "github connections own read" on public.github_connections;
drop policy if exists "github connections own update" on public.github_connections;
drop index if exists public.github_connections_github_user_id_idx;

create policy "service role owns github user tokens"
on private.github_user_tokens
for all
to service_role
using (true)
with check (true);
