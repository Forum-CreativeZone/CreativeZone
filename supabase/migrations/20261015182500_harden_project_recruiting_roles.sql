create or replace function public.apply_project_recruiting(
  p_opening_id uuid,
  p_message text default '',
  p_availability text default '',
  p_portfolio_url text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_opening public.project_recruiting_openings%rowtype;
  v_project public.projects%rowtype;
  v_id uuid;
  v_is_member boolean:=false;
begin
  if v_user is null then raise exception 'Autenticação necessária.'; end if;
  select * into v_opening from public.project_recruiting_openings where id=p_opening_id;
  if not found then raise exception 'Vaga não encontrada.'; end if;
  select * into v_project from public.projects where id=v_opening.project_id;
  if not found or v_project.status='archived' then raise exception 'Projeto indisponível.'; end if;
  if v_opening.status<>'open' then raise exception 'Esta vaga não está recebendo candidaturas.'; end if;
  if v_project.owner_id=v_user then raise exception 'O responsável pelo projeto não precisa se candidatar.'; end if;

  select exists(
    select 1 from public.project_members pm
    where pm.project_id=v_opening.project_id and pm.user_id=v_user and pm.status='active'
  ) into v_is_member;

  if v_opening.visibility='team' and not v_is_member then
    raise exception 'Esta oportunidade é restrita aos membros atuais da equipe.';
  end if;
  if v_opening.visibility='public' and v_is_member then
    raise exception 'Você já faz parte deste projeto.';
  end if;
  if char_length(coalesce(p_message,''))>3000 then raise exception 'Mensagem muito longa.'; end if;
  if char_length(coalesce(p_availability,''))>240 then raise exception 'Disponibilidade muito longa.'; end if;

  insert into public.project_recruiting_applications(
    opening_id,project_id,user_id,message,availability,portfolio_url,status,updated_at
  ) values(
    p_opening_id,v_opening.project_id,v_user,trim(coalesce(p_message,'')),trim(coalesce(p_availability,'')),
    nullif(trim(coalesce(p_portfolio_url,'')),''),'pending',now()
  )
  on conflict(opening_id,user_id) do update
  set message=excluded.message,availability=excluded.availability,portfolio_url=excluded.portfolio_url,
      status='pending',reviewed_by=null,review_note='',reviewed_at=null,updated_at=now()
  where public.project_recruiting_applications.status in ('rejected','withdrawn')
  returning id into v_id;

  if v_id is null then raise exception 'Você já possui uma candidatura ativa para esta vaga.'; end if;

  insert into public.notifications(user_id,actor_id,type,data)
  select distinct target.user_id,v_user,'project_recruiting_application',jsonb_build_object(
    'project_id',v_opening.project_id,'project_title',v_project.title,'opening_id',v_opening.id,'opening_title',v_opening.title,
    'application_id',v_id,'message',trim(coalesce(p_message,'')),'path','/projetos/'||v_project.slug
  )
  from (
    select v_project.owner_id as user_id
    union
    select pm.user_id from public.project_members pm where pm.project_id=v_opening.project_id and pm.status='active' and pm.role='maintainer'
  ) target
  where target.user_id is not null and target.user_id<>v_user;

  return v_id;
end;
$$;

create or replace function public.review_project_recruiting_application(
  p_application_id uuid,
  p_status text,
  p_review_note text default ''
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_app public.project_recruiting_applications%rowtype;
  v_opening public.project_recruiting_openings%rowtype;
  v_project public.projects%rowtype;
  v_accepted integer;
  v_candidate text;
begin
  if p_status not in ('shortlisted','accepted','rejected') then raise exception 'Status de revisão inválido.'; end if;
  select * into v_app from public.project_recruiting_applications where id=p_application_id;
  if not found then raise exception 'Candidatura não encontrada.'; end if;
  if v_app.status not in ('pending','shortlisted') then raise exception 'Esta candidatura já foi finalizada.'; end if;
  if not private.current_user_can_manage_project_recruiting(v_app.project_id) then
    raise exception 'Sua função não permite revisar esta candidatura.';
  end if;

  select * into v_opening from public.project_recruiting_openings where id=v_app.opening_id;
  select * into v_project from public.projects where id=v_app.project_id;

  update public.project_recruiting_applications
  set status=p_status,reviewed_by=v_user,review_note=trim(coalesce(p_review_note,'')),reviewed_at=now(),updated_at=now()
  where id=p_application_id;

  if p_status='accepted' then
    insert into public.project_members(project_id,user_id,role,status,message,joined_at,updated_at)
    values(v_app.project_id,v_app.user_id,'contributor','active',v_app.message,now(),now())
    on conflict(project_id,user_id) do update
    set role=case
          when public.project_members.role='owner' then 'owner'
          when public.project_members.role='maintainer' then 'maintainer'
          else 'contributor'
        end,
        status='active',message=excluded.message,updated_at=now()
    where public.project_members.role<>'owner';

    select count(*)::integer into v_accepted
    from public.project_recruiting_applications
    where opening_id=v_opening.id and status='accepted';

    if v_accepted>=v_opening.slots then
      update public.project_recruiting_openings
      set status='filled',closed_at=coalesce(closed_at,now()),updated_at=now()
      where id=v_opening.id and status<>'closed';
    end if;

    if v_project.visibility='public' and v_opening.visibility='public' then
      select coalesce(nullif(display_name,''),nullif(username,''),'Membro') into v_candidate from public.profiles where id=v_app.user_id;
      insert into public.project_activity_feed(
        project_id,source,event_type,event_key,actor_user_id,actor_label,title,summary,status,metadata,occurred_at
      ) values(
        v_project.id,'creativezone','recruiting_application_accepted','recruiting:accepted:'||v_app.id,
        v_app.user_id,coalesce(v_candidate,'Membro'),coalesce(v_candidate,'Membro')||' entrou no projeto',
        v_opening.title,'accepted',jsonb_build_object('opening_id',v_opening.id,'application_id',v_app.id),now()
      ) on conflict(project_id,event_key) do nothing;
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

revoke all on function public.apply_project_recruiting(uuid,text,text,text) from public;
revoke all on function public.review_project_recruiting_application(uuid,text,text) from public;
grant execute on function public.apply_project_recruiting(uuid,text,text,text) to authenticated;
grant execute on function public.review_project_recruiting_application(uuid,text,text) to authenticated;
