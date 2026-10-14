create policy "service role owns github credentials"
on private.github_user_credentials
for all
to service_role
using (true)
with check (true);
