create schema if not exists private;

alter table public.github_connections
  add column if not exists github_user_id bigint,
  add column if not exists avatar_url text,
  add column if not exists profile_url text,
  add column if not exists scopes text[] not null default '{}',
  add column if not exists connected_at timestamptz,
  add column if not exists token_updated_at timestamptz;

create unique index if not exists github_connections_github_user_id_idx
  on public.github_connections(github_user_id)
  where github_user_id is not null;

create table if not exists private.github_user_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  updated_at timestamptz not null default now()
);

alter table private.github_user_tokens enable row level security;
revoke all on private.github_user_tokens from anon, authenticated;

drop policy if exists "github connections own read" on public.github_connections;
create policy "github connections own read"
on public.github_connections
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "github connections own update" on public.github_connections;
create policy "github connections own update"
on public.github_connections
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create index if not exists github_connections_username_idx
  on public.github_connections(lower(github_username));
