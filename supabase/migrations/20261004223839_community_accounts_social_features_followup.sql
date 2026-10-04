create index if not exists ignores_ignored_id_idx on public.ignores(ignored_id);

drop policy if exists "own reactions" on public.reactions;
drop policy if exists "users add own reactions" on public.reactions;
create policy "users add own reactions"
on public.reactions for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "users delete own reactions" on public.reactions;
create policy "users delete own reactions"
on public.reactions for delete to authenticated
using ((select auth.uid()) = user_id);

alter table public.profiles
  add column if not exists public_birth_day smallint,
  add column if not exists public_birth_month smallint,
  add column if not exists public_birth_year smallint;

do $$ begin
  alter table public.profiles
    add constraint profiles_public_birth_day_check
    check (public_birth_day between 1 and 31 or public_birth_day is null);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles
    add constraint profiles_public_birth_month_check
    check (public_birth_month between 1 and 12 or public_birth_month is null);
exception when duplicate_object then null; end $$;
