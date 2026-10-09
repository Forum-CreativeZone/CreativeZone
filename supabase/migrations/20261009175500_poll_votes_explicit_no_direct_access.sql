drop policy if exists "poll votes no direct access" on public.topic_poll_votes;
create policy "poll votes no direct access"
on public.topic_poll_votes
for all
to anon,authenticated
using (false)
with check (false);
