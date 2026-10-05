
alter table public.topics
  drop constraint if exists topics_category_id_fkey;

alter table public.topics
  add constraint topics_category_id_fkey
  foreign key (category_id)
  references public.categories(id)
  on delete restrict;

drop policy if exists "admins create categories" on public.categories;
create policy "admins create categories"
on public.categories for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role='admin'
  )
);

drop policy if exists "admins update categories" on public.categories;
create policy "admins update categories"
on public.categories for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role='admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role='admin'
  )
);

drop policy if exists "admins delete categories" on public.categories;
create policy "admins delete categories"
on public.categories for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role='admin'
  )
);

revoke all on table public.categories from anon, authenticated;
grant select on table public.categories to anon, authenticated;
grant insert, update, delete on table public.categories to authenticated;

create table if not exists public.category_suggestions (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  suggested_name text not null check (char_length(suggested_name) between 3 and 80),
  description text not null default '' check (char_length(description) <= 1200),
  status text not null default 'pending'
    check (status in ('pending','reviewing','approved','declined')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  admin_note text not null default '' check (char_length(admin_note) <= 1200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists category_suggestions_user_created_idx
  on public.category_suggestions(user_id,created_at desc);
create index if not exists category_suggestions_status_created_idx
  on public.category_suggestions(status,created_at desc);

alter table public.category_suggestions enable row level security;

drop policy if exists "members submit category suggestions" on public.category_suggestions;
create policy "members submit category suggestions"
on public.category_suggestions for insert
to authenticated
with check (
  user_id=(select auth.uid())
  and status='pending'
  and reviewed_by is null
  and reviewed_at is null
  and admin_note=''
);

drop policy if exists "members and staff read category suggestions" on public.category_suggestions;
create policy "members and staff read category suggestions"
on public.category_suggestions for select
to authenticated
using (
  user_id=(select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role in ('moderator','admin')
  )
);

drop policy if exists "staff review category suggestions" on public.category_suggestions;
create policy "staff review category suggestions"
on public.category_suggestions for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role in ('moderator','admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role in ('moderator','admin')
  )
);

drop policy if exists "members withdraw pending category suggestions" on public.category_suggestions;
create policy "members withdraw pending category suggestions"
on public.category_suggestions for delete
to authenticated
using (
  user_id=(select auth.uid()) and status='pending'
);

revoke all on table public.category_suggestions from anon, authenticated;
grant select,insert,update,delete on table public.category_suggestions to authenticated;

delete from public.categories c
where c.slug in ('duvidas','games','hardware','off-topic','software','tecnologia')
  and not exists (
    select 1 from public.topics t where t.category_id=c.id
  );

insert into public.categories(name,slug,description)
values(
  'Regras e Comunicados',
  'regras-e-comunicados',
  'Regras oficiais, orientações, avisos e comunicados importantes da CreativeZone.'
)
on conflict(slug) do update
set name=excluded.name,
    description=excluded.description;
