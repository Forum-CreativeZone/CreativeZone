drop policy if exists "Authenticated avatar delete" on storage.objects;

create policy "Authenticated avatar delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and owner_id = (select auth.uid())::text
);
