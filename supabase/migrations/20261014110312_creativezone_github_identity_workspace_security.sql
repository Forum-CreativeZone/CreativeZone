alter table public.github_connections
  add column if not exists github_user_id bigint,
  add column if not exists avatar_url text,
  add column if not exists profile_url text,
  add column if not exists account_type text,
  add column if not exists scopes text[] not null default '{}'::text[],
  add column if not exists connected_via text not null default 'supabase_oauth',
  add column if not exists connected_at timestamptz not null default now(),
  add column if not exists last_verified_at timestamptz;

create unique index if not exists github_connections_github_user_id_uidx
  on public.github_connections(github_user_id)
  where github_user_id is not null;

create schema if not exists private;

create table if not exists private.github_user_credentials (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  access_token text not null,
  scopes text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.github_user_credentials enable row level security;
revoke all on private.github_user_credentials from public, anon, authenticated;
grant all on private.github_user_credentials to service_role;

create or replace function public.store_github_user_credential(
  p_user_id uuid,
  p_access_token text,
  p_scopes text[] default '{}'::text[]
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_user_id is null or nullif(btrim(p_access_token),'') is null then
    raise exception 'invalid github credential';
  end if;
  insert into private.github_user_credentials(user_id,access_token,scopes,updated_at)
  values(p_user_id,p_access_token,coalesce(p_scopes,'{}'::text[]),now())
  on conflict(user_id) do update
  set access_token=excluded.access_token,scopes=excluded.scopes,updated_at=now();
end;
$$;

create or replace function public.get_github_user_credential(p_user_id uuid)
returns table(access_token text, scopes text[], updated_at timestamptz)
language sql security definer set search_path = ''
as $$
  select c.access_token,c.scopes,c.updated_at
  from private.github_user_credentials c
  where c.user_id=p_user_id
  limit 1
$$;

create or replace function public.delete_github_user_credential(p_user_id uuid)
returns void language sql security definer set search_path = ''
as $$
  delete from private.github_user_credentials where user_id=p_user_id
$$;

revoke all on function public.store_github_user_credential(uuid,text,text[]) from public,anon,authenticated;
revoke all on function public.get_github_user_credential(uuid) from public,anon,authenticated;
revoke all on function public.delete_github_user_credential(uuid) from public,anon,authenticated;
grant execute on function public.store_github_user_credential(uuid,text,text[]) to service_role;
grant execute on function public.get_github_user_credential(uuid) to service_role;
grant execute on function public.delete_github_user_credential(uuid) to service_role;

alter table public.github_devhub_actions drop constraint if exists github_devhub_actions_action_type_check;
alter table public.github_devhub_actions add constraint github_devhub_actions_action_type_check
check (action_type = any (array[
  'create_repo','sync','create_file','upload_file','update_file','delete_file',
  'commit','branch','pull_request','merge_pull_request','issue','issue_comment',
  'review','terminal'
]::text[]));

create unique index if not exists github_devhub_repositories_project_uidx
  on public.github_devhub_repositories(project_id) where project_id is not null;
create index if not exists github_devhub_repositories_owner_idx
  on public.github_devhub_repositories(owner_login,repository_name);
create index if not exists github_devhub_actions_user_created_idx
  on public.github_devhub_actions(user_id,created_at desc);
create index if not exists github_devhub_actions_repo_created_idx
  on public.github_devhub_actions(repository_id,created_at desc);

alter table public.github_devhub_repositories enable row level security;
alter table public.github_devhub_actions enable row level security;
alter table public.github_devhub_org_requests enable row level security;

create policy "devhub repositories readable by participants"
on public.github_devhub_repositories for select to authenticated
using (
  user_id=(select auth.uid())
  or exists (select 1 from public.projects p where p.id=github_devhub_repositories.project_id and p.owner_id=(select auth.uid()))
  or exists (select 1 from public.project_members pm where pm.project_id=github_devhub_repositories.project_id and pm.user_id=(select auth.uid()) and pm.status='active')
  or exists (select 1 from public.profiles pr where pr.id=(select auth.uid()) and (pr.system_owner or pr.role in ('admin','moderator')))
);

create policy "devhub actions readable by participants"
on public.github_devhub_actions for select to authenticated
using (
  user_id=(select auth.uid())
  or exists (
    select 1 from public.github_devhub_repositories r
    join public.projects p on p.id=r.project_id
    where r.id=github_devhub_actions.repository_id and p.owner_id=(select auth.uid())
  )
  or exists (
    select 1 from public.github_devhub_repositories r
    join public.project_members pm on pm.project_id=r.project_id
    where r.id=github_devhub_actions.repository_id and pm.user_id=(select auth.uid()) and pm.status='active'
  )
  or exists (select 1 from public.profiles pr where pr.id=(select auth.uid()) and (pr.system_owner or pr.role in ('admin','moderator')))
);

create policy "devhub org requests readable"
on public.github_devhub_org_requests for select to authenticated
using (
  user_id=(select auth.uid())
  or exists (select 1 from public.profiles pr where pr.id=(select auth.uid()) and (pr.system_owner or pr.role in ('admin','moderator')))
);

revoke all on public.github_devhub_repositories from anon;
revoke all on public.github_devhub_actions from anon;
revoke all on public.github_devhub_org_requests from anon;
revoke insert,update,delete,truncate,references,trigger on public.github_devhub_repositories from authenticated;
revoke insert,update,delete,truncate,references,trigger on public.github_devhub_actions from authenticated;
revoke insert,update,delete,truncate,references,trigger on public.github_devhub_org_requests from authenticated;
grant select on public.github_devhub_repositories to authenticated;
grant select on public.github_devhub_actions to authenticated;
grant select on public.github_devhub_org_requests to authenticated;

revoke all on public.github_connections from anon;
revoke insert,update,delete,truncate,references,trigger on public.github_connections from authenticated;
grant select on public.github_connections to authenticated;
