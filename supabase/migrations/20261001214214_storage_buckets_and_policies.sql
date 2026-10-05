insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('forum-media', 'forum-media', false)
on conflict (id) do nothing;

create policy "Public avatar read"
on storage.objects
for select
using (bucket_id = 'avatars');

create policy "Authenticated avatar upload"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'avatars' and owner_id = (select auth.uid()::text));

create policy "Authenticated avatar update"
on storage.objects
for update
to authenticated
using (bucket_id = 'avatars' and owner_id = (select auth.uid()::text))
with check (bucket_id = 'avatars' and owner_id = (select auth.uid()::text));

create policy "Authenticated media upload"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'forum-media' and owner_id = (select auth.uid()::text));

create policy "Authenticated media read"
on storage.objects
for select
to authenticated
using (bucket_id = 'forum-media');
