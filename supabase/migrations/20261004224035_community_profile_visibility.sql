alter table public.profiles
  add column if not exists profile_visibility text not null default 'public';

do $$ begin
  alter table public.profiles
    add constraint profiles_visibility_check
    check (profile_visibility in ('public','members','private'));
exception when duplicate_object then null; end $$;

drop policy if exists "profiles public read" on public.profiles;
drop policy if exists "profiles visibility read" on public.profiles;
create policy "profiles visibility read"
on public.profiles for select to public
using (
  profile_visibility = 'public'
  or (profile_visibility = 'members' and (select auth.uid()) is not null)
  or id = (select auth.uid())
);

drop policy if exists "follows public read" on public.follows;
drop policy if exists "follows visibility read" on public.follows;
create policy "follows visibility read"
on public.follows for select to public
using (
  (select auth.uid()) = follower_id
  or (select auth.uid()) = following_id
  or (
    coalesce((select show_followers from public.profiles where id = follower_id), false)
    and coalesce((select show_followers from public.profiles where id = following_id), false)
  )
);
