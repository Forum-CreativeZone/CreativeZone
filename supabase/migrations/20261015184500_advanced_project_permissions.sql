create table if not exists public.project_role_permissions (
  role text primary key,
  label_en text not null,
  label_pt text not null,
  description_en text not null default '',
  description_pt text not null default '',
  sort_order integer not null default 100,
  capabilities jsonb not null default '{}'::jsonb
);

alter table public.project_role_permissions enable row level security;
drop policy if exists "project role matrix readable" on public.project_role_permissions;
create policy "project role matrix readable"
on public.project_role_permissions for select
to anon,authenticated
using (true);
grant select on public.project_role_permissions to anon,authenticated;

insert into public.project_role_permissions(role,label_en,label_pt,description_en,description_pt,sort_order,capabilities)
values
('owner','Owner','Responsável','Full ownership and destructive control.','Controle total, inclusive ações destrutivas.',10,
 '{"code_read":true,"code_write":true,"issues_read":true,"issues_create":true,"issues_comment":true,"issues_manage":true,"prs_read":true,"prs_create":true,"prs_comment":true,"prs_review":true,"prs_merge":true,"kanban_read":true,"kanban_write":true,"kanban_participate":true,"kanban_comment":true,"kanban_manage":true,"team_view":true,"team_invite":true,"team_manage_roles":true,"settings_read":true,"settings_manage":true,"terminal":true,"run_code":true,"actions_read":true,"actions_manage":true,"security_read":true,"security_manage":true,"recruiting_manage":true,"project_updates_write":true,"destructive":true}'::jsonb),
('maintainer','Maintainer','Maintainer','Operational administration without ownership transfer or destructive project actions.','Administração operacional sem transferência de propriedade ou ações destrutivas do projeto.',20,
 '{"code_read":true,"code_write":true,"issues_read":true,"issues_create":true,"issues_comment":true,"issues_manage":true,"prs_read":true,"prs_create":true,"prs_comment":true,"prs_review":true,"prs_merge":true,"kanban_read":true,"kanban_write":true,"kanban_participate":true,"kanban_comment":true,"kanban_manage":true,"team_view":true,"team_invite":true,"team_manage_roles":false,"settings_read":true,"settings_manage":true,"terminal":true,"run_code":true,"actions_read":true,"actions_manage":true,"security_read":true,"security_manage":true,"recruiting_manage":true,"project_updates_write":true,"destructive":false}'::jsonb),
('developer','Developer','Developer','Builds code, opens Issues and Pull Requests, and works on the board.','Edita código, cria Issues e Pull Requests e trabalha no quadro.',30,
 '{"code_read":true,"code_write":true,"issues_read":true,"issues_create":true,"issues_comment":true,"issues_manage":false,"prs_read":true,"prs_create":true,"prs_comment":true,"prs_review":false,"prs_merge":false,"kanban_read":true,"kanban_write":true,"kanban_participate":true,"kanban_comment":true,"kanban_manage":false,"team_view":true,"team_invite":false,"team_manage_roles":false,"settings_read":false,"settings_manage":false,"terminal":true,"run_code":true,"actions_read":true,"actions_manage":false,"security_read":true,"security_manage":false,"recruiting_manage":false,"project_updates_write":true,"destructive":false}'::jsonb),
('reviewer','Reviewer','Reviewer','Read access with Issue comments and Pull Request reviews.','Leitura, comentários em Issues e revisão de Pull Requests.',40,
 '{"code_read":true,"code_write":false,"issues_read":true,"issues_create":false,"issues_comment":true,"issues_manage":false,"prs_read":true,"prs_create":false,"prs_comment":true,"prs_review":true,"prs_merge":false,"kanban_read":true,"kanban_write":false,"kanban_participate":false,"kanban_comment":true,"kanban_manage":false,"team_view":true,"team_invite":false,"team_manage_roles":false,"settings_read":false,"settings_manage":false,"terminal":false,"run_code":false,"actions_read":true,"actions_manage":false,"security_read":true,"security_manage":false,"recruiting_manage":false,"project_updates_write":false,"destructive":false}'::jsonb),
('designer','Designer','Designer','Can edit only authorized repository paths and collaborate on Issues and assigned board work.','Edita apenas caminhos autorizados do repositório e colabora em Issues e cards atribuídos.',50,
 '{"code_read":true,"code_write":true,"issues_read":true,"issues_create":true,"issues_comment":true,"issues_manage":false,"prs_read":true,"prs_create":false,"prs_comment":true,"prs_review":false,"prs_merge":false,"kanban_read":true,"kanban_write":false,"kanban_participate":true,"kanban_comment":true,"kanban_manage":false,"team_view":true,"team_invite":false,"team_manage_roles":false,"settings_read":false,"settings_manage":false,"terminal":false,"run_code":false,"actions_read":true,"actions_manage":false,"security_read":true,"security_manage":false,"recruiting_manage":false,"project_updates_write":true,"destructive":false}'::jsonb),
('member','Member','Membro','Community contributor with read access, Issues, comments and assigned board work.','Colaborador da comunidade com leitura, Issues, comentários e cards atribuídos.',60,
 '{"code_read":true,"code_write":false,"issues_read":true,"issues_create":true,"issues_comment":true,"issues_manage":false,"prs_read":true,"prs_create":false,"prs_comment":true,"prs_review":false,"prs_merge":false,"kanban_read":true,"kanban_write":false,"kanban_participate":true,"kanban_comment":true,"kanban_manage":false,"team_view":true,"team_invite":false,"team_manage_roles":false,"settings_read":false,"settings_manage":false,"terminal":false,"run_code":false,"actions_read":true,"actions_manage":false,"security_read":true,"security_manage":false,"recruiting_manage":false,"project_updates_write":true,"destructive":false}'::jsonb),
('viewer','Viewer','Visualizador','Read-only access to project development areas.','Acesso somente leitura às áreas de desenvolvimento do projeto.',70,
 '{"code_read":true,"code_write":false,"issues_read":true,"issues_create":false,"issues_comment":false,"issues_manage":false,"prs_read":true,"prs_create":false,"prs_comment":false,"prs_review":false,"prs_merge":false,"kanban_read":true,"kanban_write":false,"kanban_participate":false,"kanban_comment":false,"kanban_manage":false,"team_view":true,"team_invite":false,"team_manage_roles":false,"settings_read":false,"settings_manage":false,"terminal":false,"run_code":false,"actions_read":true,"actions_manage":false,"security_read":true,"security_manage":false,"recruiting_manage":false,"project_updates_write":false,"destructive":false}'::jsonb)
on conflict(role) do update set
 label_en=excluded.label_en,label_pt=excluded.label_pt,
 description_en=excluded.description_en,description_pt=excluded.description_pt,
 sort_order=excluded.sort_order,capabilities=excluded.capabilities;

alter table public.project_members drop constraint if exists project_members_role_check;
update public.project_members set role='developer' where role='contributor';
alter table public.project_members
  add column if not exists operational_access boolean not null default false,
  add column if not exists allowed_paths text[] not null default '{}'::text[];
alter table public.project_members
  add constraint project_members_role_check
  check (role in ('owner','maintainer','developer','reviewer','designer','member','viewer','interested'));

create table if not exists public.project_member_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  invited_user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member'
    check (role in ('maintainer','developer','reviewer','designer','member','viewer')),
  operational_access boolean not null default false,
  allowed_paths text[] not null default '{}'::text[],
  message text not null default '' check (char_length(message)<=2000),
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique(project_id,invited_user_id,status)
);

create index if not exists project_member_invites_project_status_idx
  on public.project_member_invites(project_id,status,created_at desc);
create index if not exists project_member_invites_user_status_idx
  on public.project_member_invites(invited_user_id,status,created_at desc);

alter table public.project_member_invites enable row level security;
drop policy if exists "project member invites readable" on public.project_member_invites;
create policy "project member invites readable"
on public.project_member_invites for select to authenticated
using (
  invited_user_id=(select auth.uid())
  or private.is_system_owner((select auth.uid()))
  or exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid()))
  or exists(
    select 1 from public.project_members pm
    where pm.project_id=project_id and pm.user_id=(select auth.uid())
      and pm.status='active' and (pm.role='maintainer' or pm.operational_access)
  )
);
grant select on public.project_member_invites to authenticated;
revoke insert,update,delete on public.project_member_invites from anon,authenticated;

create or replace function private.project_permissions_for_user(p_project_id uuid,p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_owner uuid;
  v_role text;
  v_operational boolean:=false;
  v_paths text[]:='{}'::text[];
  v_caps jsonb:='{}'::jsonb;
  v_effective text;
begin
  if p_user_id is null then
    return jsonb_build_object('role','none','effective_role','none','operational_access',false,'allowed_paths','[]'::jsonb,'capabilities','{}'::jsonb,'is_owner',false);
  end if;

  select owner_id into v_owner from public.projects where id=p_project_id;
  if not found then
    return jsonb_build_object('role','none','effective_role','none','operational_access',false,'allowed_paths','[]'::jsonb,'capabilities','{}'::jsonb,'is_owner',false);
  end if;

  if private.is_system_owner(p_user_id) or v_owner=p_user_id then
    select capabilities into v_caps from public.project_role_permissions where role='owner';
    return jsonb_build_object('role','owner','effective_role','owner','operational_access',true,'allowed_paths','[]'::jsonb,'capabilities',coalesce(v_caps,'{}'::jsonb),'is_owner',true);
  end if;

  select pm.role,pm.operational_access,pm.allowed_paths
    into v_role,v_operational,v_paths
  from public.project_members pm
  where pm.project_id=p_project_id and pm.user_id=p_user_id and pm.status='active';

  if not found then
    return jsonb_build_object('role','none','effective_role','none','operational_access',false,'allowed_paths','[]'::jsonb,'capabilities','{}'::jsonb,'is_owner',false);
  end if;

  v_effective:=case when v_operational then 'maintainer' else v_role end;
  select capabilities into v_caps from public.project_role_permissions where role=v_effective;

  return jsonb_build_object(
    'role',v_role,
    'effective_role',v_effective,
    'operational_access',v_operational,
    'allowed_paths',to_jsonb(coalesce(v_paths,'{}'::text[])),
    'capabilities',coalesce(v_caps,'{}'::jsonb),
    'is_owner',false
  );
end;
$$;

create or replace function private.project_has_capability(p_project_id uuid,p_capability text,p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    ((private.project_permissions_for_user(p_project_id,p_user_id)->'capabilities'->>p_capability)::boolean),
    false
  )
$$;

create or replace function private.project_can_write_path(p_project_id uuid,p_user_id uuid,p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_permissions jsonb;
  v_role text;
  v_operational boolean;
  v_path text:=trim(both '/' from coalesce(p_path,''));
  v_allowed text;
begin
  v_permissions:=private.project_permissions_for_user(p_project_id,p_user_id);
  if not coalesce((v_permissions->'capabilities'->>'code_write')::boolean,false) then return false; end if;
  v_role:=v_permissions->>'role';
  v_operational:=coalesce((v_permissions->>'operational_access')::boolean,false);
  if v_role<>'designer' or v_operational then return true; end if;
  if v_path='' then return false; end if;
  for v_allowed in select jsonb_array_elements_text(v_permissions->'allowed_paths') loop
    v_allowed:=trim(both '/' from v_allowed);
    if v_allowed<>'' and (v_path=v_allowed or v_path like v_allowed||'/%') then return true; end if;
  end loop;
  return false;
end;
$$;

revoke all on function private.project_permissions_for_user(uuid,uuid) from public;
revoke all on function private.project_has_capability(uuid,text,uuid) from public;
revoke all on function private.project_can_write_path(uuid,uuid,text) from public;
grant execute on function private.project_permissions_for_user(uuid,uuid) to authenticated;
grant execute on function private.project_has_capability(uuid,text,uuid) to authenticated;
grant execute on function private.project_can_write_path(uuid,uuid,text) to authenticated;

create or replace function public.get_project_permissions(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Autenticação necessária.'; end if;
  return private.project_permissions_for_user(p_project_id,v_user);
end;
$$;

create or replace function public.get_project_team_access(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_can_view boolean:=false;
  v_can_manage boolean:=false;
  v_can_invite boolean:=false;
  v_roles jsonb:='[]'::jsonb;
  v_members jsonb:='[]'::jsonb;
  v_invites jsonb:='[]'::jsonb;
begin
  select exists(
    select 1 from public.projects p
    where p.id=p_project_id and (
      p.visibility='public'
      or p.owner_id=v_user
      or private.is_system_owner(v_user)
      or exists(select 1 from public.project_members pm where pm.project_id=p_project_id and pm.user_id=v_user and pm.status='active')
    )
  ) into v_can_view;
  if not v_can_view then raise exception 'Acesso ao projeto negado.'; end if;

  v_can_manage:=coalesce(private.project_has_capability(p_project_id,'team_manage_roles',v_user),false);
  v_can_invite:=coalesce(private.project_has_capability(p_project_id,'team_invite',v_user),false);

  select coalesce(jsonb_agg(jsonb_build_object(
    'role',r.role,'label_en',r.label_en,'label_pt',r.label_pt,
    'description_en',r.description_en,'description_pt',r.description_pt,
    'capabilities',r.capabilities
  ) order by r.sort_order),'[]'::jsonb)
  into v_roles
  from public.project_role_permissions r;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',pm.user_id,'role',pm.role,'status',pm.status,
    'operational_access',pm.operational_access,'allowed_paths',to_jsonb(pm.allowed_paths),
    'message',case when v_can_invite then pm.message else '' end,
    'profile',jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,'occupation',p.occupation),
    'permissions',private.project_permissions_for_user(pm.project_id,pm.user_id)
  ) order by case pm.role when 'owner' then 0 when 'maintainer' then 1 else 2 end,p.display_name,p.username),'[]'::jsonb)
  into v_members
  from public.project_members pm
  join public.profiles p on p.id=pm.user_id
  where pm.project_id=p_project_id and pm.status in ('active','pending');

  if v_can_invite or v_can_manage then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',i.id,'invited_user_id',i.invited_user_id,'invited_by',i.invited_by,
      'role',i.role,'operational_access',i.operational_access,'allowed_paths',to_jsonb(i.allowed_paths),
      'message',i.message,'status',i.status,'created_at',i.created_at,
      'profile',jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,'occupation',p.occupation)
    ) order by i.created_at desc),'[]'::jsonb)
    into v_invites
    from public.project_member_invites i
    join public.profiles p on p.id=i.invited_user_id
    where i.project_id=p_project_id and i.status='pending';
  end if;

  return jsonb_build_object(
    'current',case when v_user is null then null else private.project_permissions_for_user(p_project_id,v_user) end,
    'roles',v_roles,'members',v_members,'invites',v_invites,
    'can_manage_roles',v_can_manage,'can_invite',v_can_invite
  );
end;
$$;

create or replace function public.set_project_member_access(
  p_project_id uuid,p_user_id uuid,p_role text,p_operational_access boolean default false,p_allowed_paths text[] default '{}'::text[]
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_project public.projects%rowtype;
begin
  select * into v_project from public.projects where id=p_project_id;
  if not found then raise exception 'Projeto não encontrado.'; end if;
  if not (private.is_system_owner(v_actor) or v_project.owner_id=v_actor) then
    raise exception 'Somente o responsável do projeto pode alterar funções e acesso operacional.';
  end if;
  if p_user_id=v_project.owner_id then raise exception 'A função do responsável não pode ser alterada.'; end if;
  if p_role not in ('maintainer','developer','reviewer','designer','member','viewer') then raise exception 'Função inválida.'; end if;
  if coalesce(array_length(p_allowed_paths,1),0)>40 then raise exception 'Use no máximo 40 caminhos autorizados.'; end if;

  update public.project_members
  set role=p_role,
      operational_access=coalesce(p_operational_access,false),
      allowed_paths=case when p_role='designer' and not coalesce(p_operational_access,false) then coalesce(p_allowed_paths,'{}'::text[]) else '{}'::text[] end,
      updated_at=now()
  where project_id=p_project_id and user_id=p_user_id and status='active' and role<>'owner';
  if not found then raise exception 'Membro ativo não encontrado.'; end if;

  insert into public.notifications(user_id,actor_id,type,data)
  values(p_user_id,v_actor,'project_role_updated',jsonb_build_object(
    'project_id',p_project_id,'project_title',v_project.title,'role',p_role,
    'operational_access',coalesce(p_operational_access,false),'path','/projetos/'||v_project.slug
  ));
end;
$$;

create or replace function public.search_project_invite_candidates(p_project_id uuid,p_query text default '')
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_q text:=trim(coalesce(p_query,''));
  v_rows jsonb;
begin
  if not private.project_has_capability(p_project_id,'team_invite',v_user) then raise exception 'Sua função não permite convidar membros.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,'occupation',p.occupation
  ) order by p.display_name,p.username),'[]'::jsonb)
  into v_rows
  from (
    select p.*
    from public.profiles p
    where p.id<>v_user
      and (v_q='' or p.username ilike '%'||v_q||'%' or p.display_name ilike '%'||v_q||'%')
      and not exists(select 1 from public.projects pr where pr.id=p_project_id and pr.owner_id=p.id)
      and not exists(select 1 from public.project_members pm where pm.project_id=p_project_id and pm.user_id=p.id and pm.status in ('active','pending'))
      and not exists(select 1 from public.project_member_invites i where i.project_id=p_project_id and i.invited_user_id=p.id and i.status='pending')
    order by p.display_name,p.username
    limit 20
  ) p;
  return v_rows;
end;
$$;

create or replace function public.create_project_member_invite(
  p_project_id uuid,p_user_id uuid,p_role text default 'member',p_message text default '',
  p_operational_access boolean default false,p_allowed_paths text[] default '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_project public.projects%rowtype;
  v_id uuid;
  v_actor_owner boolean:=false;
begin
  if v_actor is null then raise exception 'Autenticação necessária.'; end if;
  if not private.project_has_capability(p_project_id,'team_invite',v_actor) then raise exception 'Sua função não permite convidar membros.'; end if;
  select * into v_project from public.projects where id=p_project_id and status<>'archived';
  if not found then raise exception 'Projeto não encontrado.'; end if;
  v_actor_owner:=private.is_system_owner(v_actor) or v_project.owner_id=v_actor;

  if p_role not in ('maintainer','developer','reviewer','designer','member','viewer') then raise exception 'Função inválida.'; end if;
  if not v_actor_owner and (p_role='maintainer' or coalesce(p_operational_access,false)) then
    raise exception 'Somente o responsável pode conceder Maintainer ou acesso operacional.';
  end if;
  if p_user_id=v_project.owner_id then raise exception 'Este usuário já é o responsável do projeto.'; end if;
  if char_length(coalesce(p_message,''))>2000 then raise exception 'Mensagem muito longa.'; end if;
  if exists(select 1 from public.project_members pm where pm.project_id=p_project_id and pm.user_id=p_user_id and pm.status='active') then
    raise exception 'Este usuário já faz parte do projeto.';
  end if;

  insert into public.project_member_invites(project_id,invited_user_id,invited_by,role,operational_access,allowed_paths,message)
  values(
    p_project_id,p_user_id,v_actor,p_role,
    case when v_actor_owner then coalesce(p_operational_access,false) else false end,
    case when p_role='designer' and not coalesce(p_operational_access,false) then coalesce(p_allowed_paths,'{}'::text[]) else '{}'::text[] end,
    trim(coalesce(p_message,''))
  ) returning id into v_id;

  insert into public.notifications(user_id,actor_id,type,data)
  values(p_user_id,v_actor,'project_member_invite',jsonb_build_object(
    'invite_id',v_id,'project_id',p_project_id,'project_title',v_project.title,'role',p_role,
    'message',trim(coalesce(p_message,'')),'path','/projetos/'||v_project.slug
  ));
  return v_id;
end;
$$;

create or replace function public.respond_project_member_invite(p_invite_id uuid,p_accept boolean)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_invite public.project_member_invites%rowtype;
begin
  select * into v_invite from public.project_member_invites where id=p_invite_id and invited_user_id=v_user and status='pending';
  if not found then raise exception 'Convite não encontrado.'; end if;

  update public.project_member_invites
  set status=case when p_accept then 'accepted' else 'declined' end,responded_at=now()
  where id=p_invite_id;

  if p_accept then
    insert into public.project_members(project_id,user_id,role,status,message,joined_at,updated_at,operational_access,allowed_paths)
    values(v_invite.project_id,v_user,v_invite.role,'active',v_invite.message,now(),now(),v_invite.operational_access,v_invite.allowed_paths)
    on conflict(project_id,user_id) do update
    set role=excluded.role,status='active',message=excluded.message,updated_at=now(),
        operational_access=excluded.operational_access,allowed_paths=excluded.allowed_paths
    where public.project_members.role<>'owner';
  end if;
end;
$$;

create or replace function public.cancel_project_member_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_project uuid;
begin
  select project_id into v_project from public.project_member_invites where id=p_invite_id and status='pending';
  if not found then raise exception 'Convite não encontrado.'; end if;
  if not private.project_has_capability(v_project,'team_invite',v_user) then raise exception 'Sua função não permite cancelar convites.'; end if;
  update public.project_member_invites set status='cancelled',responded_at=now() where id=p_invite_id;
end;
$$;

revoke all on function public.get_project_permissions(uuid) from public;
revoke all on function public.get_project_team_access(uuid) from public;
revoke all on function public.set_project_member_access(uuid,uuid,text,boolean,text[]) from public;
revoke all on function public.search_project_invite_candidates(uuid,text) from public;
revoke all on function public.create_project_member_invite(uuid,uuid,text,text,boolean,text[]) from public;
revoke all on function public.respond_project_member_invite(uuid,boolean) from public;
revoke all on function public.cancel_project_member_invite(uuid) from public;
grant execute on function public.get_project_permissions(uuid) to authenticated;
grant execute on function public.get_project_team_access(uuid) to anon,authenticated;
grant execute on function public.set_project_member_access(uuid,uuid,text,boolean,text[]) to authenticated;
grant execute on function public.search_project_invite_candidates(uuid,text) to authenticated;
grant execute on function public.create_project_member_invite(uuid,uuid,text,text,boolean,text[]) to authenticated;
grant execute on function public.respond_project_member_invite(uuid,boolean) to authenticated;
grant execute on function public.cancel_project_member_invite(uuid) to authenticated;

create or replace function public.review_project_member(p_project_id uuid,p_user_id uuid,p_status text,p_role text default 'member')
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_owner boolean:=false;
begin
  if p_status not in ('active','declined') then raise exception 'Invalid membership status'; end if;
  if p_role not in ('maintainer','developer','reviewer','designer','member','viewer') then raise exception 'Invalid membership role'; end if;
  if not private.project_has_capability(p_project_id,'team_invite',v_user) then raise exception 'Project management access required'; end if;
  select private.is_system_owner(v_user) or exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=v_user) into v_owner;
  if not v_owner and p_role='maintainer' then raise exception 'Somente o responsável pode conceder Maintainer.'; end if;

  update public.project_members
  set status=p_status,role=case when p_status='active' then p_role else role end,
      operational_access=false,allowed_paths='{}'::text[],updated_at=now()
  where project_id=p_project_id and user_id=p_user_id and role<>'owner';
end;
$$;

create or replace function public.update_project_status(p_project_id uuid,p_status text)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_status not in ('idea','planning','active','paused','completed','archived') then raise exception 'Invalid project status'; end if;
  if p_status='archived' then
    if not private.project_has_capability(p_project_id,'destructive',auth.uid()) then raise exception 'Only the project owner can archive this project'; end if;
  elsif not private.project_has_capability(p_project_id,'settings_manage',auth.uid()) then
    raise exception 'Project management access required';
  end if;
  update public.projects set status=p_status,updated_at=now() where id=p_project_id;
end;
$$;

drop policy if exists "active project members post updates" on public.project_updates;
create policy "active project members post updates"
on public.project_updates for insert to authenticated
with check (
  author_id=(select auth.uid())
  and private.project_has_capability(project_id,'project_updates_write',(select auth.uid()))
);

create or replace function private.current_user_can_read_project_kanban(p_project_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select private.project_has_capability(p_project_id,'kanban_read',(select auth.uid())) $$;

create or replace function private.current_user_can_write_project_kanban(p_project_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select private.project_has_capability(p_project_id,'kanban_write',(select auth.uid())) or private.project_has_capability(p_project_id,'kanban_participate',(select auth.uid())) $$;

create or replace function private.current_user_can_manage_project_kanban(p_project_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select private.project_has_capability(p_project_id,'kanban_manage',(select auth.uid())) $$;

create or replace function private.current_user_can_manage_project_recruiting(p_project_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select private.project_has_capability(p_project_id,'recruiting_manage',(select auth.uid())) $$;

create or replace function public.update_project_kanban_card(
  p_card_id uuid,p_title text,p_description text,p_priority text,p_labels text[],p_assignee_id uuid,p_due_at timestamptz,
  p_github_issue_number integer,p_github_issue_url text,p_github_pr_number integer,p_github_pr_url text,p_github_branch text,p_checklist jsonb
)
returns void language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_project uuid; v_creator uuid; v_assignee uuid;
begin
  select project_id,created_by,assignee_id into v_project,v_creator,v_assignee from public.project_kanban_cards where id=p_card_id;
  if not found then raise exception 'Card não encontrado.'; end if;
  if not private.project_has_capability(v_project,'kanban_write',v_user)
     and not (private.project_has_capability(v_project,'kanban_participate',v_user) and (v_creator=v_user or v_assignee=v_user)) then
    raise exception 'Sua função permite editar apenas cards criados ou atribuídos a você.';
  end if;
  if char_length(trim(coalesce(p_title,'')))<3 then raise exception 'Informe um título com pelo menos 3 caracteres.'; end if;
  if char_length(coalesce(p_description,''))>5000 then raise exception 'Descrição muito longa.'; end if;
  if p_priority not in ('low','normal','high','urgent') then raise exception 'Prioridade inválida.'; end if;
  if coalesce(array_length(p_labels,1),0)>12 then raise exception 'Use no máximo 12 labels.'; end if;
  if jsonb_typeof(coalesce(p_checklist,'[]'::jsonb))<>'array' then raise exception 'Checklist inválido.'; end if;
  if jsonb_array_length(coalesce(p_checklist,'[]'::jsonb))>50 then raise exception 'Use no máximo 50 itens no checklist.'; end if;
  if not private.valid_project_kanban_assignee(v_project,p_assignee_id) then raise exception 'Responsável precisa fazer parte do projeto.'; end if;

  update public.project_kanban_cards set
    title=trim(p_title),description=coalesce(p_description,''),priority=p_priority,labels=coalesce(p_labels,'{}'::text[]),
    assignee_id=p_assignee_id,due_at=p_due_at,github_issue_number=p_github_issue_number,
    github_issue_url=nullif(trim(coalesce(p_github_issue_url,'')),''),github_pr_number=p_github_pr_number,
    github_pr_url=nullif(trim(coalesce(p_github_pr_url,'')),''),github_branch=nullif(trim(coalesce(p_github_branch,'')),''),
    checklist=coalesce(p_checklist,'[]'::jsonb),updated_by=v_user,updated_at=now()
  where id=p_card_id;
  insert into public.project_kanban_history(project_id,card_id,actor_id,action_type,metadata)
  values(v_project,p_card_id,v_user,'updated',jsonb_build_object('title',trim(p_title)));
end;
$$;

create or replace function public.move_project_kanban_card(p_card_id uuid,p_column_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid:=auth.uid(); v_project uuid; v_from uuid; v_title text; v_to_done boolean; v_from_done boolean;
  v_position integer; v_action text; v_label text; v_creator uuid; v_assignee uuid;
begin
  select k.project_id,k.column_id,k.title,c.is_done,k.created_by,k.assignee_id
    into v_project,v_from,v_title,v_from_done,v_creator,v_assignee
  from public.project_kanban_cards k join public.project_kanban_columns c on c.id=k.column_id where k.id=p_card_id;
  if not found then raise exception 'Card não encontrado.'; end if;
  if not private.project_has_capability(v_project,'kanban_write',v_user)
     and not (private.project_has_capability(v_project,'kanban_participate',v_user) and (v_creator=v_user or v_assignee=v_user)) then
    raise exception 'Sua função permite mover apenas cards criados ou atribuídos a você.';
  end if;
  select is_done into v_to_done from public.project_kanban_columns where id=p_column_id and project_id=v_project;
  if not found then raise exception 'Coluna inválida.'; end if;
  select coalesce(max(position),0)+100 into v_position from public.project_kanban_cards where project_id=v_project and column_id=p_column_id and id<>p_card_id;
  update public.project_kanban_cards set column_id=p_column_id,position=v_position,updated_by=v_user,updated_at=now(),
    completed_at=case when v_to_done then coalesce(completed_at,now()) else null end where id=p_card_id;
  v_action:=case when v_to_done and not v_from_done then 'completed' when not v_to_done and v_from_done then 'reopened' else 'moved' end;
  insert into public.project_kanban_history(project_id,card_id,actor_id,action_type,from_column_id,to_column_id,metadata)
  values(v_project,p_card_id,v_user,v_action,v_from,p_column_id,jsonb_build_object('title',v_title));
  if v_action in ('completed','reopened') then
    select coalesce(nullif(display_name,''),nullif(username,''),'Membro') into v_label from public.profiles where id=v_user;
    insert into public.project_activity_feed(project_id,source,event_type,event_key,actor_user_id,actor_label,title,summary,status,metadata,occurred_at)
    values(v_project,'creativezone',case when v_action='completed' then 'kanban_card_completed' else 'kanban_card_reopened' end,
      'kanban:'||v_action||':'||p_card_id||':'||extract(epoch from now())::bigint,v_user,coalesce(v_label,'Membro'),
      coalesce(v_label,'Membro')||case when v_action='completed' then ' concluiu um card' else ' reabriu um card' end,
      v_title,case when v_action='completed' then 'success' else 'reopened' end,jsonb_build_object('card_id',p_card_id),now());
  end if;
end;
$$;

create or replace function public.add_project_kanban_comment(p_card_id uuid,p_content text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_project uuid; v_id uuid;
begin
  select project_id into v_project from public.project_kanban_cards where id=p_card_id;
  if not found then raise exception 'Card não encontrado.'; end if;
  if not private.project_has_capability(v_project,'kanban_comment',v_user) then raise exception 'Sua função não permite comentar neste Kanban.'; end if;
  if char_length(trim(coalesce(p_content,'')))<1 or char_length(p_content)>4000 then raise exception 'Comentário inválido.'; end if;
  insert into public.project_kanban_comments(project_id,card_id,user_id,content) values(v_project,p_card_id,v_user,trim(p_content)) returning id into v_id;
  insert into public.project_kanban_history(project_id,card_id,actor_id,action_type,metadata) values(v_project,p_card_id,v_user,'commented',jsonb_build_object('comment_id',v_id));
  return v_id;
end;
$$;

create or replace function public.review_project_recruiting_application(p_application_id uuid,p_status text,p_review_note text default '')
returns void
language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid:=auth.uid(); v_app public.project_recruiting_applications%rowtype; v_opening public.project_recruiting_openings%rowtype;
  v_project public.projects%rowtype; v_accepted integer; v_candidate text; v_role text;
begin
  if p_status not in ('shortlisted','accepted','rejected') then raise exception 'Status de revisão inválido.'; end if;
  select * into v_app from public.project_recruiting_applications where id=p_application_id;
  if not found then raise exception 'Candidatura não encontrada.'; end if;
  if v_app.status not in ('pending','shortlisted') then raise exception 'Esta candidatura já foi finalizada.'; end if;
  if not private.project_has_capability(v_app.project_id,'recruiting_manage',v_user) then raise exception 'Sua função não permite revisar esta candidatura.'; end if;
  select * into v_opening from public.project_recruiting_openings where id=v_app.opening_id;
  select * into v_project from public.projects where id=v_app.project_id;

  update public.project_recruiting_applications set status=p_status,reviewed_by=v_user,review_note=trim(coalesce(p_review_note,'')),reviewed_at=now(),updated_at=now() where id=p_application_id;

  if p_status='accepted' then
    v_role:=case v_opening.category
      when 'design' then 'designer'
      when 'qa' then 'reviewer'
      when 'docs' then 'member'
      else 'developer'
    end;
    insert into public.project_members(project_id,user_id,role,status,message,joined_at,updated_at,operational_access,allowed_paths)
    values(v_app.project_id,v_app.user_id,v_role,'active',v_app.message,now(),now(),false,'{}'::text[])
    on conflict(project_id,user_id) do update
    set role=case when public.project_members.role in ('owner','maintainer') then public.project_members.role else excluded.role end,
        status='active',message=excluded.message,updated_at=now()
    where public.project_members.role<>'owner';

    select count(*)::integer into v_accepted from public.project_recruiting_applications where opening_id=v_opening.id and status='accepted';
    if v_accepted>=v_opening.slots then update public.project_recruiting_openings set status='filled',closed_at=coalesce(closed_at,now()),updated_at=now() where id=v_opening.id and status<>'closed'; end if;
    if v_project.visibility='public' and v_opening.visibility='public' then
      select coalesce(nullif(display_name,''),nullif(username,''),'Membro') into v_candidate from public.profiles where id=v_app.user_id;
      insert into public.project_activity_feed(project_id,source,event_type,event_key,actor_user_id,actor_label,title,summary,status,metadata,occurred_at)
      values(v_project.id,'creativezone','recruiting_application_accepted','recruiting:accepted:'||v_app.id,v_app.user_id,coalesce(v_candidate,'Membro'),
        coalesce(v_candidate,'Membro')||' entrou no projeto',v_opening.title,'accepted',jsonb_build_object('opening_id',v_opening.id,'application_id',v_app.id,'role',v_role),now())
      on conflict(project_id,event_key) do nothing;
    end if;
  end if;

  insert into public.notifications(user_id,actor_id,type,data)
  values(v_app.user_id,v_user,'project_recruiting_status',jsonb_build_object(
    'project_id',v_project.id,'project_title',v_project.title,'opening_id',v_opening.id,'opening_title',v_opening.title,
    'application_id',v_app.id,'status',p_status,'review_note',trim(coalesce(p_review_note,'')),
    'message',case p_status when 'accepted' then 'Sua candidatura foi aceita.' when 'shortlisted' then 'Sua candidatura avançou para a seleção.' else 'Sua candidatura foi encerrada.' end,
    'path','/projetos/'||v_project.slug
  ));
end;
$$;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='project_member_invites') then
    alter publication supabase_realtime add table public.project_member_invites;
  end if;
end $$;
