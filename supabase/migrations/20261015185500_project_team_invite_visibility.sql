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
  v_my_invite jsonb:=null;
begin
  select exists(
    select 1 from public.projects p
    where p.id=p_project_id and (
      p.visibility='public'
      or p.owner_id=v_user
      or private.is_system_owner(v_user)
      or exists(select 1 from public.project_members pm where pm.project_id=p_project_id and pm.user_id=v_user and pm.status='active')
      or exists(select 1 from public.project_member_invites i where i.project_id=p_project_id and i.invited_user_id=v_user and i.status='pending')
    )
  ) into v_can_view;
  if not v_can_view then raise exception 'Acesso ao projeto negado.'; end if;

  v_can_manage:=case when v_user is null then false else coalesce(private.project_has_capability(p_project_id,'team_manage_roles',v_user),false) end;
  v_can_invite:=case when v_user is null then false else coalesce(private.project_has_capability(p_project_id,'team_invite',v_user),false) end;

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

  if v_user is not null then
    select jsonb_build_object(
      'id',i.id,'role',i.role,'operational_access',i.operational_access,
      'allowed_paths',to_jsonb(i.allowed_paths),'message',i.message,'created_at',i.created_at
    )
    into v_my_invite
    from public.project_member_invites i
    where i.project_id=p_project_id and i.invited_user_id=v_user and i.status='pending'
    order by i.created_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'current',case when v_user is null then null else private.project_permissions_for_user(p_project_id,v_user) end,
    'roles',v_roles,'members',v_members,'invites',v_invites,'my_invite',v_my_invite,
    'can_manage_roles',v_can_manage,'can_invite',v_can_invite
  );
end;
$$;

revoke all on function public.get_project_team_access(uuid) from public;
grant execute on function public.get_project_team_access(uuid) to anon,authenticated;
