-- Allow every topic author to attach protected download links.
-- FREE members always publish member-accessible downloads.
-- PRO/ELITE members (and the system owner) may additionally choose VIP-only access.

drop policy if exists "owner inserts topic downloads" on public.topic_downloads;
drop policy if exists "owner updates topic downloads" on public.topic_downloads;
drop policy if exists "owner deletes topic downloads" on public.topic_downloads;
drop policy if exists "topic authors insert downloads" on public.topic_downloads;
drop policy if exists "topic authors update downloads" on public.topic_downloads;
drop policy if exists "topic authors delete downloads" on public.topic_downloads;

create policy "topic authors insert downloads"
on public.topic_downloads
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.system_owner = true
    )
    or exists (
      select 1
      from public.topics t
      where t.id = topic_downloads.topic_id
        and t.author_id = (select auth.uid())
    )
  )
  and (
    access_scope = 'member'
    or (
      access_scope = 'paid'
      and (
        exists (
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
    )
  )
);

create policy "topic authors update downloads"
on public.topic_downloads
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.system_owner = true
  )
  or (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.topics t
      where t.id = topic_downloads.topic_id
        and t.author_id = (select auth.uid())
    )
  )
)
with check (
  (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.system_owner = true
    )
    or (
      created_by = (select auth.uid())
      and exists (
        select 1
        from public.topics t
        where t.id = topic_downloads.topic_id
          and t.author_id = (select auth.uid())
      )
    )
  )
  and (
    access_scope = 'member'
    or (
      access_scope = 'paid'
      and (
        exists (
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
    )
  )
);

create policy "topic authors delete downloads"
on public.topic_downloads
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.system_owner = true
  )
  or (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.topics t
      where t.id = topic_downloads.topic_id
        and t.author_id = (select auth.uid())
    )
  )
);

drop policy if exists "owner inserts download targets" on public.topic_download_targets;
drop policy if exists "owner updates download targets" on public.topic_download_targets;
drop policy if exists "owner deletes download targets" on public.topic_download_targets;
drop policy if exists "topic authors insert download targets" on public.topic_download_targets;
drop policy if exists "topic authors update download targets" on public.topic_download_targets;
drop policy if exists "topic authors delete download targets" on public.topic_download_targets;

create policy "topic authors insert download targets"
on public.topic_download_targets
for insert
to authenticated
with check (
  exists (
    select 1
    from public.topic_downloads d
    join public.topics t on t.id = d.topic_id
    where d.id = topic_download_targets.download_id
      and (
        exists (
          select 1
          from public.profiles p
          where p.id = (select auth.uid())
            and p.system_owner = true
        )
        or (
          d.created_by = (select auth.uid())
          and t.author_id = (select auth.uid())
        )
      )
  )
);

create policy "topic authors update download targets"
on public.topic_download_targets
for update
to authenticated
using (
  exists (
    select 1
    from public.topic_downloads d
    join public.topics t on t.id = d.topic_id
    where d.id = topic_download_targets.download_id
      and (
        exists (
          select 1
          from public.profiles p
          where p.id = (select auth.uid())
            and p.system_owner = true
        )
        or (
          d.created_by = (select auth.uid())
          and t.author_id = (select auth.uid())
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.topic_downloads d
    join public.topics t on t.id = d.topic_id
    where d.id = topic_download_targets.download_id
      and (
        exists (
          select 1
          from public.profiles p
          where p.id = (select auth.uid())
            and p.system_owner = true
        )
        or (
          d.created_by = (select auth.uid())
          and t.author_id = (select auth.uid())
        )
      )
  )
);

create policy "topic authors delete download targets"
on public.topic_download_targets
for delete
to authenticated
using (
  exists (
    select 1
    from public.topic_downloads d
    join public.topics t on t.id = d.topic_id
    where d.id = topic_download_targets.download_id
      and (
        exists (
          select 1
          from public.profiles p
          where p.id = (select auth.uid())
            and p.system_owner = true
        )
        or (
          d.created_by = (select auth.uid())
          and t.author_id = (select auth.uid())
        )
      )
  )
);
