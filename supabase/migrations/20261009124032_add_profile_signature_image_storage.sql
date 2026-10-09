insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-signatures',
  'profile-signatures',
  true,
  8388608,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/bmp'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile signatures public read" on storage.objects;
create policy "profile signatures public read"
on storage.objects
for select
to public
using (bucket_id = 'profile-signatures');

drop policy if exists "users upload own profile signatures" on storage.objects;
create policy "users upload own profile signatures"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-signatures'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "users update own profile signatures" on storage.objects;
create policy "users update own profile signatures"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-signatures'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-signatures'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "users delete own profile signatures" on storage.objects;
create policy "users delete own profile signatures"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-signatures'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
