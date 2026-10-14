create table if not exists public.creative_teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 3 and 80),
  slug text not null unique,
  description text not null default '' check (char_length(description) <= 2000),
  public_profile boolean not null default false,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creative_team_members (
  team_id uuid not null references public.creative_teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','maintainer','developer','reviewer','designer','member','viewer')),
  status text not null default 'active' check (status in ('active','removed')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(team_id,user_id)
);

create table if not exists public.creative_team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.creative_teams(id) on delete cascade,
  invited_user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('maintainer','developer','reviewer','designer','member','viewer')),
  message text not null default '' check (char_length(message) <= 1000),
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create unique index if not exists creative_team_invites_one_pending
  on public.creative_team_invites(team_id,invited_user_id)
  where status='pending';

create table if not exists public.creative_team_topics (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.creative_teams(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 160),
  slug text not null,
  visibility text not null default 'team_only' check (visibility in ('team_only','public_preview')),
  public_summary text not null default '' check (char_length(public_summary) <= 3000),
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_id,slug)
);

create table if not exists public.creative_team_topic_private (
  topic_id uuid primary key references public.creative_team_topics(id) on delete cascade,
  content text not null default '' check (char_length(content) <= 50000),
  updated_at timestamptz not null default now()
);

create table if not exists public.creative_team_posts (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.creative_team_topics(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creative_teams_owner_idx on public.creative_teams(owner_id,created_at desc);
create index if not exists creative_team_members_user_idx on public.creative_team_members(user_id,status,team_id);
create index if not exists creative_team_invites_user_idx on public.creative_team_invites(invited_user_id,status,created_at desc);
create index if not exists creative_team_topics_team_idx on public.creative_team_topics(team_id,created_at desc);
create index if not exists creative_team_topics_visibility_idx on public.creative_team_topics(visibility,created_at desc);
create index if not exists creative_team_posts_topic_idx on public.creative_team_posts(topic_id,created_at);

alter table public.creative_teams enable row level security;
alter table public.creative_team_members enable row level security;
alter table public.creative_team_invites enable row level security;
alter table public.creative_team_topics enable row level security;
alter table public.creative_team_topic_private enable row level security;
alter table public.creative_team_posts enable row level security;

create or replace function private.current_user_is_system_owner()
returns boolean language sql stable security definer set search_path=''
as $$ select coalesce(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.system_owner=true),false) $$;

create or replace function private.current_user_is_team_member(p_team_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select coalesce(exists(select 1 from public.creative_team_members m where m.team_id=p_team_id and m.user_id=(select auth.uid()) and m.status='active'),false) $$;

create or replace function private.current_user_is_team_owner(p_team_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select private.current_user_is_system_owner() or coalesce(exists(select 1 from public.creative_teams t where t.id=p_team_id and t.owner_id=(select auth.uid())),false) $$;

create or replace function private.current_user_can_manage_team_topics(p_team_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select private.current_user_is_system_owner() or coalesce(exists(select 1 from public.creative_team_members m where m.team_id=p_team_id and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','maintainer')),false) $$;

create or replace function private.current_user_can_contribute_team(p_team_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select private.current_user_is_system_owner() or coalesce(exists(select 1 from public.creative_team_members m where m.team_id=p_team_id and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','maintainer','developer','reviewer','designer','member')),false) $$;

revoke all on function private.current_user_is_system_owner() from public;
revoke all on function private.current_user_is_team_member(uuid) from public;
revoke all on function private.current_user_is_team_owner(uuid) from public;
revoke all on function private.current_user_can_manage_team_topics(uuid) from public;
revoke all on function private.current_user_can_contribute_team(uuid) from public;
grant execute on function private.current_user_is_system_owner() to authenticated;
grant execute on function private.current_user_is_team_member(uuid) to authenticated;
grant execute on function private.current_user_is_team_owner(uuid) to authenticated;
grant execute on function private.current_user_can_manage_team_topics(uuid) to authenticated;
grant execute on function private.current_user_can_contribute_team(uuid) to authenticated;

create policy "public team profiles readable" on public.creative_teams for select to anon using (public_profile=true);
create policy "team profiles readable" on public.creative_teams for select to authenticated using (public_profile=true or (select private.current_user_is_team_member(id)) or (select private.current_user_is_system_owner()));
create policy "team members readable by team" on public.creative_team_members for select to authenticated using ((select private.current_user_is_team_member(team_id)) or (select private.current_user_is_system_owner()));
create policy "team invites readable by parties" on public.creative_team_invites for select to authenticated using (invited_user_id=(select auth.uid()) or (select private.current_user_is_team_owner(team_id)));
create policy "public preview team topics readable" on public.creative_team_topics for select to anon using (visibility='public_preview');
create policy "team topics readable" on public.creative_team_topics for select to authenticated using (visibility='public_preview' or (select private.current_user_is_team_member(team_id)) or (select private.current_user_is_system_owner()));
create policy "team private topic content readable" on public.creative_team_topic_private for select to authenticated using (exists(select 1 from public.creative_team_topics t where t.id=topic_id and ((select private.current_user_is_team_member(t.team_id)) or (select private.current_user_is_system_owner()))));
create policy "team posts readable" on public.creative_team_posts for select to authenticated using (exists(select 1 from public.creative_team_topics t where t.id=topic_id and ((select private.current_user_is_team_member(t.team_id)) or (select private.current_user_is_system_owner()))));

revoke insert,update,delete on public.creative_teams from anon,authenticated;
revoke insert,update,delete on public.creative_team_members from anon,authenticated;
revoke insert,update,delete on public.creative_team_invites from anon,authenticated;
revoke insert,update,delete on public.creative_team_topics from anon,authenticated;
revoke insert,update,delete on public.creative_team_topic_private from anon,authenticated;
revoke insert,update,delete on public.creative_team_posts from anon,authenticated;

grant select on public.creative_teams to anon,authenticated;
grant select on public.creative_team_members to authenticated;
grant select on public.creative_team_invites to authenticated;
grant select on public.creative_team_topics to anon,authenticated;
grant select on public.creative_team_topic_private to authenticated;
grant select on public.creative_team_posts to authenticated;

update public.membership_plans
set entitlements = entitlements || jsonb_build_object(
  'private_teams', case when id='elite' then true else false end,
  'team_private_topics', case when id='elite' then true else false end,
  'team_role_management', case when id='elite' then true else false end,
  'team_public_preview_topics', case when id='elite' then true else false end
)
where id in ('free','pro','elite');
