create table if not exists public.projects (
  id uuid primary key default extensions.uuid_generate_v4(),
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null check (char_length(title) between 3 and 120),
  slug text not null unique,
  summary text not null check (char_length(summary) between 10 and 280),
  description text not null default '' check (char_length(description) <= 12000),
  status text not null default 'idea' check (status in ('idea','planning','active','paused','completed','archived')),
  visibility text not null default 'public' check (visibility in ('public','members')),
  repo_url text,
  website_url text,
  tags text[] not null default '{}',
  skills_needed text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_owner_idx on public.projects(owner_id);
create index if not exists projects_status_created_idx on public.projects(status,created_at desc);
alter table public.projects enable row level security;

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'interested' check (role in ('owner','maintainer','contributor','interested')),
  status text not null default 'pending' check (status in ('pending','active','declined','left')),
  message text not null default '' check (char_length(message) <= 1000),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(project_id,user_id)
);
create index if not exists project_members_user_idx on public.project_members(user_id);
alter table public.project_members enable row level security;

create table if not exists public.project_updates (
  id uuid primary key default extensions.uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  content text not null check (char_length(content) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists project_updates_project_created_idx on public.project_updates(project_id,created_at desc);
alter table public.project_updates enable row level security;

drop policy if exists "projects visible" on public.projects;
create policy "projects visible"
on public.projects for select
using (visibility='public' or auth.uid() is not null);

drop policy if exists "members create projects" on public.projects;
create policy "members create projects"
on public.projects for insert to authenticated
with check (owner_id=(select auth.uid()));

drop policy if exists "owners maintain projects" on public.projects;
create policy "owners maintain projects"
on public.projects for update to authenticated
using (
  owner_id=(select auth.uid())
  or exists (
    select 1 from public.project_members pm
    where pm.project_id=projects.id and pm.user_id=(select auth.uid())
      and pm.status='active' and pm.role='maintainer'
  )
)
with check (
  owner_id=(select auth.uid())
  or exists (
    select 1 from public.project_members pm
    where pm.project_id=projects.id and pm.user_id=(select auth.uid())
      and pm.status='active' and pm.role='maintainer'
  )
);

drop policy if exists "owners delete projects" on public.projects;
create policy "owners delete projects"
on public.projects for delete to authenticated
using (owner_id=(select auth.uid()));

drop policy if exists "project memberships visible" on public.project_members;
create policy "project memberships visible"
on public.project_members for select
using (
  exists (
    select 1 from public.projects p
    where p.id=project_id and (p.visibility='public' or auth.uid() is not null)
  )
);

drop policy if exists "members request project participation" on public.project_members;
create policy "members request project participation"
on public.project_members for insert to authenticated
with check (
  user_id=(select auth.uid())
  and role='interested'
  and status='pending'
);

drop policy if exists "members leave projects" on public.project_members;
create policy "members leave projects"
on public.project_members for update to authenticated
using (user_id=(select auth.uid()) and role<>'owner')
with check (user_id=(select auth.uid()) and role<>'owner' and status='left');

drop policy if exists "project updates visible" on public.project_updates;
create policy "project updates visible"
on public.project_updates for select
using (
  exists (
    select 1 from public.projects p
    where p.id=project_id and (p.visibility='public' or auth.uid() is not null)
  )
);

drop policy if exists "active project members post updates" on public.project_updates;
create policy "active project members post updates"
on public.project_updates for insert to authenticated
with check (
  author_id=(select auth.uid())
  and exists (
    select 1 from public.projects p
    where p.id=project_id and (
      p.owner_id=(select auth.uid())
      or exists (
        select 1 from public.project_members pm
        where pm.project_id=project_id and pm.user_id=(select auth.uid())
          and pm.status='active' and pm.role in ('maintainer','contributor')
      )
    )
  )
);

create or replace function private.add_project_owner()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.owner_id is not null then
    insert into public.project_members(project_id,user_id,role,status)
    values(new.id,new.owner_id,'owner','active')
    on conflict(project_id,user_id) do update set role='owner',status='active',updated_at=now();
  end if;
  return new;
end;
$$;
drop trigger if exists add_project_owner on public.projects;
create trigger add_project_owner
after insert on public.projects
for each row execute function private.add_project_owner();

create or replace function public.review_project_member(
  p_project_id uuid,
  p_user_id uuid,
  p_status text,
  p_role text default 'contributor'
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_allowed boolean := false;
begin
  if p_status not in ('active','declined') then raise exception 'Invalid membership status'; end if;
  if p_role not in ('maintainer','contributor') then raise exception 'Invalid membership role'; end if;

  select exists(
    select 1 from public.projects p
    where p.id=p_project_id and (
      p.owner_id=v_user
      or exists (
        select 1 from public.project_members pm
        where pm.project_id=p_project_id and pm.user_id=v_user
          and pm.status='active' and pm.role='maintainer'
      )
    )
  ) into v_allowed;
  if not v_allowed then raise exception 'Project management access required'; end if;

  update public.project_members
  set status=p_status,
      role=case when p_status='active' then p_role else role end,
      updated_at=now()
  where project_id=p_project_id and user_id=p_user_id and role<>'owner';
end;
$$;
revoke all on function public.review_project_member(uuid,uuid,text,text) from public, anon;
grant execute on function public.review_project_member(uuid,uuid,text,text) to authenticated;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists project_members_set_updated_at on public.project_members;
create trigger project_members_set_updated_at before update on public.project_members
for each row execute function public.set_updated_at();

grant select on public.projects to anon;
grant select,insert,update,delete on public.projects to authenticated;
grant select on public.project_members to anon;
grant select,insert,update on public.project_members to authenticated;
grant select on public.project_updates to anon;
grant select,insert on public.project_updates to authenticated;
