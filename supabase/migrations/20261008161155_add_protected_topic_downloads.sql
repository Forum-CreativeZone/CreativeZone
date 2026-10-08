create table if not exists public.topic_downloads (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  access_scope text not null default 'member' check (access_scope in ('member','paid')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists topic_downloads_topic_id_idx
  on public.topic_downloads(topic_id, created_at);

create table if not exists public.topic_download_targets (
  download_id uuid primary key references public.topic_downloads(id) on delete cascade,
  target_url text not null check (target_url ~* '^https?://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.topic_downloads enable row level security;
alter table public.topic_download_targets enable row level security;

grant select on public.topic_downloads to anon, authenticated;
grant insert, update, delete on public.topic_downloads to authenticated;

grant select, insert, update, delete on public.topic_download_targets to authenticated;
revoke all on public.topic_download_targets from anon;

drop policy if exists "topic downloads public metadata read" on public.topic_downloads;
create policy "topic downloads public metadata read"
on public.topic_downloads
for select
to anon, authenticated
using (true);

drop policy if exists "owner inserts topic downloads" on public.topic_downloads;
create policy "owner inserts topic downloads"
on public.topic_downloads
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.system_owner = true
  )
);

drop policy if exists "owner updates topic downloads" on public.topic_downloads;
create policy "owner updates topic downloads"
on public.topic_downloads
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.system_owner = true
  )
)
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.system_owner = true
  )
);

drop policy if exists "owner deletes topic downloads" on public.topic_downloads;
create policy "owner deletes topic downloads"
on public.topic_downloads
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.system_owner = true
  )
);

drop policy if exists "authorized members read download targets" on public.topic_download_targets;
create policy "authorized members read download targets"
on public.topic_download_targets
for select
to authenticated
using (
  exists (
    select 1
    from public.topic_downloads d
    where d.id = topic_download_targets.download_id
      and (
        exists (
          select 1 from public.profiles owner_profile
          where owner_profile.id = (select auth.uid())
            and owner_profile.system_owner = true
        )
        or d.access_scope = 'member'
        or (
          d.access_scope = 'paid'
          and exists (
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
      )
  )
);

drop policy if exists "owner inserts download targets" on public.topic_download_targets;
create policy "owner inserts download targets"
on public.topic_download_targets
for insert
to authenticated
with check (
  exists (
    select 1 from public.topic_downloads d
    join public.profiles p on p.id = d.created_by
    where d.id = topic_download_targets.download_id
      and d.created_by = (select auth.uid())
      and p.system_owner = true
  )
);

drop policy if exists "owner updates download targets" on public.topic_download_targets;
create policy "owner updates download targets"
on public.topic_download_targets
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.system_owner = true
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.system_owner = true
  )
);

drop policy if exists "owner deletes download targets" on public.topic_download_targets;
create policy "owner deletes download targets"
on public.topic_download_targets
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.system_owner = true
  )
);
