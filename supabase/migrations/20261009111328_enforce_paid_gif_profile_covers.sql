drop policy if exists "users upload own profile covers" on storage.objects;
create policy "users upload own profile covers"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (
    lower(coalesce(metadata->>'mimetype','')) <> 'image/gif'
    or exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.system_owner = true
    )
    or exists (
      select 1
      from public.user_memberships um
      join public.membership_plans mp on mp.id = um.plan_id
      where um.user_id = (select auth.uid())
        and um.status = 'active'
        and (um.permanent or um.ends_at is null or um.ends_at > now())
        and mp.active = true
        and mp.rank >= 1
    )
  )
);

drop policy if exists "users update own profile covers" on storage.objects;
create policy "users update own profile covers"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (
    lower(coalesce(metadata->>'mimetype','')) <> 'image/gif'
    or exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.system_owner = true
    )
    or exists (
      select 1
      from public.user_memberships um
      join public.membership_plans mp on mp.id = um.plan_id
      where um.user_id = (select auth.uid())
        and um.status = 'active'
        and (um.permanent or um.ends_at is null or um.ends_at > now())
        and mp.active = true
        and mp.rank >= 1
    )
  )
);
