create table if not exists public.project_recruiting_openings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(title) between 3 and 120),
  category text not null default 'other'
    check (category in ('design','frontend','backend','fullstack','mobile','python','qa','docs','security','devops','other')),
  summary text not null default '' check (char_length(summary) <= 280),
  description text not null default '' check (char_length(description) <= 5000),
  skills text[] not null default '{}'::text[],
  commitment text not null default '' check (char_length(commitment) <= 180),
  experience text not null default '' check (char_length(experience) <= 180),
  slots integer not null default 1 check (slots between 1 and 20),
  visibility text not null default 'public' check (visibility in ('public','team')),
  status text not null default 'open' check (status in ('open','paused','filled','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.project_recruiting_applications (
  id uuid primary key default gen_random_uuid(),
  opening_id uuid not null references public.project_recruiting_openings(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null default '' check (char_length(message) <= 3000),
  availability text not null default '' check (char_length(availability) <= 240),
  portfolio_url text,
  status text not null default 'pending'
    check (status in ('pending','shortlisted','accepted','rejected','withdrawn')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_note text not null default '' check (char_length(review_note) <= 2000),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(opening_id,user_id)
);

create index if not exists project_recruiting_openings_project_status_idx
  on public.project_recruiting_openings(project_id,status,created_at desc);
create index if not exists project_recruiting_applications_opening_status_idx
  on public.project_recruiting_applications(opening_id,status,created_at desc);
create index if not exists project_recruiting_applications_user_idx
  on public.project_recruiting_applications(user_id,created_at desc);

alter table public.project_recruiting_openings enable row level security;
alter table public.project_recruiting_applications enable row level security;

create or replace function private.current_user_can_manage_project_recruiting(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    private.is_system_owner((select auth.uid()))
    or exists(
      select 1 from public.projects p
      where p.id=p_project_id and p.owner_id=(select auth.uid()) and p.status<>'archived'
    )
    or exists(
      select 1
      from public.project_members pm
      join public.projects p on p.id=pm.project_id
      where pm.project_id=p_project_id
        and pm.user_id=(select auth.uid())
        and pm.status='active'
        and pm.role='maintainer'
        and p.status<>'archived'
    ),
    false
  )
$$;

create or replace function private.current_user_can_view_project_recruiting(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    exists(
      select 1 from public.projects p
      where p.id=p_project_id
        and (
          p.visibility='public'
          or p.owner_id=(select auth.uid())
          or private.is_system_owner((select auth.uid()))
          or exists(
            select 1 from public.project_members pm
            where pm.project_id=p.id
              and pm.user_id=(select auth.uid())
              and pm.status='active'
          )
        )
    ),
    false
  )
$$;

revoke all on function private.current_user_can_manage_project_recruiting(uuid) from public;
revoke all on function private.current_user_can_view_project_recruiting(uuid) from public;
grant execute on function private.current_user_can_manage_project_recruiting(uuid) to authenticated;
grant execute on function private.current_user_can_view_project_recruiting(uuid) to anon,authenticated;

drop policy if exists "project recruiting openings readable" on public.project_recruiting_openings;
create policy "project recruiting openings readable"
on public.project_recruiting_openings for select
to anon,authenticated
using (
  (select private.current_user_can_view_project_recruiting(project_id))
  and (
    visibility='public'
    or (select private.current_user_can_manage_project_recruiting(project_id))
    or exists(
      select 1 from public.project_members pm
      where pm.project_id=project_recruiting_openings.project_id
        and pm.user_id=(select auth.uid())
        and pm.status='active'
    )
  )
);

drop policy if exists "project recruiting applications readable" on public.project_recruiting_applications;
create policy "project recruiting applications readable"
on public.project_recruiting_applications for select
to authenticated
using (
  user_id=(select auth.uid())
  or (select private.current_user_can_manage_project_recruiting(project_id))
);

revoke insert,update,delete on public.project_recruiting_openings from anon,authenticated;
revoke insert,update,delete on public.project_recruiting_applications from anon,authenticated;
grant select on public.project_recruiting_openings to anon,authenticated;
grant select on public.project_recruiting_applications to authenticated;

create or replace function public.get_project_recruiting(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_manager boolean:=false;
  v_project public.projects%rowtype;
  v_openings jsonb:='[]'::jsonb;
begin
  select * into v_project from public.projects where id=p_project_id;
  if not found then raise exception 'Projeto não encontrado.'; end if;
  if not private.current_user_can_view_project_recruiting(p_project_id) then
    raise exception 'Você não possui acesso a este projeto.';
  end if;

  v_manager:=case when v_user is null then false else private.current_user_can_manage_project_recruiting(p_project_id) end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,
    'project_id',o.project_id,
    'title',o.title,
    'category',o.category,
    'summary',o.summary,
    'description',o.description,
    'skills',to_jsonb(o.skills),
    'commitment',o.commitment,
    'experience',o.experience,
    'slots',o.slots,
    'visibility',o.visibility,
    'status',o.status,
    'created_at',o.created_at,
    'updated_at',o.updated_at,
    'accepted_count',(select count(*) from public.project_recruiting_applications a where a.opening_id=o.id and a.status='accepted'),
    'applications_count',case when v_manager then (select count(*) from public.project_recruiting_applications a where a.opening_id=o.id and a.status in ('pending','shortlisted','accepted')) else null end,
    'my_application',case when v_user is null then null else (
      select jsonb_build_object(
        'id',a.id,'status',a.status,'message',a.message,'availability',a.availability,
        'portfolio_url',a.portfolio_url,'review_note',a.review_note,'created_at',a.created_at,'reviewed_at',a.reviewed_at
      )
      from public.project_recruiting_applications a
      where a.opening_id=o.id and a.user_id=v_user
      limit 1
    ) end
  ) order by
      case o.status when 'open' then 0 when 'paused' then 1 when 'filled' then 2 else 3 end,
      o.created_at desc
  ),'[]'::jsonb)
  into v_openings
  from public.project_recruiting_openings o
  where o.project_id=p_project_id
    and (
      v_manager
      or (
        o.visibility='public'
        and v_project.visibility='public'
        and o.status in ('open','filled')
      )
      or (
        v_user is not null
        and exists(
          select 1 from public.project_members pm
          where pm.project_id=p_project_id and pm.user_id=v_user and pm.status='active'
        )
      )
    );

  return jsonb_build_object(
    'openings',v_openings,
    'permissions',jsonb_build_object(
      'can_manage',v_manager,
      'can_apply',v_user is not null and not v_manager
    )
  );
end;
$$;

create or replace function public.get_project_recruiting_applications(p_opening_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_project uuid;
  v_rows jsonb:='[]'::jsonb;
begin
  select project_id into v_project from public.project_recruiting_openings where id=p_opening_id;
  if not found then raise exception 'Vaga não encontrada.'; end if;
  if not private.current_user_can_manage_project_recruiting(v_project) then
    raise exception 'Sua função não permite revisar candidaturas.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,
    'user_id',a.user_id,
    'message',a.message,
    'availability',a.availability,
    'portfolio_url',a.portfolio_url,
    'status',a.status,
    'review_note',a.review_note,
    'created_at',a.created_at,
    'reviewed_at',a.reviewed_at,
    'profile',jsonb_build_object(
      'id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,
      'occupation',p.occupation,'skills',to_jsonb(p.skills),'technologies',to_jsonb(p.technologies)
    ),
    'passport',case
      when cp is null then null
      when coalesce((cp->>'hidden')::boolean,false) then jsonb_build_object('hidden',true)
      else jsonb_build_object(
        'hidden',false,
        'passport_id',cp->>'passport_id',
        'score',cp->'score',
        'metrics',cp->'metrics',
        'areas',cp->'areas',
        'github',cp->'github'
      )
    end
  ) order by
      case a.status when 'pending' then 0 when 'shortlisted' then 1 when 'accepted' then 2 when 'rejected' then 3 else 4 end,
      a.created_at
  ),'[]'::jsonb)
  into v_rows
  from public.project_recruiting_applications a
  join public.profiles p on p.id=a.user_id
  left join lateral (select public.get_contribution_passport(a.user_id) as cp) x on true
  cross join lateral (select x.cp as cp) pass
  where a.opening_id=p_opening_id;

  return v_rows;
end;
$$;

create or replace function public.create_project_recruiting_opening(
  p_project_id uuid,
  p_title text,
  p_category text default 'other',
  p_summary text default '',
  p_description text default '',
  p_skills text[] default '{}'::text[],
  p_commitment text default '',
  p_experience text default '',
  p_slots integer default 1,
  p_visibility text default 'public'
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_id uuid;
  v_project public.projects%rowtype;
  v_actor text;
begin
  if v_user is null then raise exception 'Autenticação necessária.'; end if;
  if not private.current_user_can_manage_project_recruiting(p_project_id) then
    raise exception 'Sua função não permite abrir vagas neste projeto.';
  end if;
  if char_length(trim(coalesce(p_title,'')))<3 then raise exception 'Informe um título para a vaga.'; end if;
  if p_category not in ('design','frontend','backend','fullstack','mobile','python','qa','docs','security','devops','other') then raise exception 'Categoria inválida.'; end if;
  if p_visibility not in ('public','team') then raise exception 'Visibilidade inválida.'; end if;
  if p_slots<1 or p_slots>20 then raise exception 'Quantidade de vagas inválida.'; end if;
  if coalesce(array_length(p_skills,1),0)>20 then raise exception 'Use no máximo 20 habilidades.'; end if;

  select * into v_project from public.projects where id=p_project_id and status<>'archived';
  if not found then raise exception 'Projeto não encontrado.'; end if;

  insert into public.project_recruiting_openings(
    project_id,created_by,title,category,summary,description,skills,commitment,experience,slots,visibility
  ) values(
    p_project_id,v_user,trim(p_title),p_category,trim(coalesce(p_summary,'')),coalesce(p_description,''),
    coalesce(p_skills,'{}'::text[]),trim(coalesce(p_commitment,'')),trim(coalesce(p_experience,'')),p_slots,p_visibility
  ) returning id into v_id;

  if p_visibility='public' and v_project.visibility='public' then
    select coalesce(nullif(display_name,''),nullif(username,''),'Membro') into v_actor from public.profiles where id=v_user;
    insert into public.project_activity_feed(
      project_id,source,event_type,event_key,actor_user_id,actor_label,title,summary,status,metadata,occurred_at
    ) values(
      p_project_id,'creativezone','recruiting_opening_created','recruiting:opening:'||v_id,
      v_user,coalesce(v_actor,'Membro'),coalesce(v_actor,'Membro')||' abriu uma oportunidade',
      trim(p_title),'open',jsonb_build_object('opening_id',v_id,'category',p_category),now()
    ) on conflict(project_id,event_key) do nothing;
  end if;

  return v_id;
end;
$$;

create or replace function public.update_project_recruiting_opening(
  p_opening_id uuid,
  p_title text,
  p_category text,
  p_summary text,
  p_description text,
  p_skills text[],
  p_commitment text,
  p_experience text,
  p_slots integer,
  p_visibility text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_project uuid;
begin
  select project_id into v_project from public.project_recruiting_openings where id=p_opening_id;
  if not found then raise exception 'Vaga não encontrada.'; end if;
  if not private.current_user_can_manage_project_recruiting(v_project) then raise exception 'Sua função não permite editar esta vaga.'; end if;
  if p_category not in ('design','frontend','backend','fullstack','mobile','python','qa','docs','security','devops','other') then raise exception 'Categoria inválida.'; end if;
  if p_visibility not in ('public','team') then raise exception 'Visibilidade inválida.'; end if;
  if p_status not in ('open','paused','filled','closed') then raise exception 'Status inválido.'; end if;
  if p_slots<1 or p_slots>20 then raise exception 'Quantidade de vagas inválida.'; end if;
  if coalesce(array_length(p_skills,1),0)>20 then raise exception 'Use no máximo 20 habilidades.'; end if;

  update public.project_recruiting_openings
  set title=trim(p_title),category=p_category,summary=trim(coalesce(p_summary,'')),description=coalesce(p_description,''),
      skills=coalesce(p_skills,'{}'::text[]),commitment=trim(coalesce(p_commitment,'')),experience=trim(coalesce(p_experience,'')),
      slots=p_slots,visibility=p_visibility,status=p_status,
      closed_at=case when p_status='closed' then coalesce(closed_at,now()) else null end,
      updated_at=now()
  where id=p_opening_id;
end;
$$;

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
  v_actor text;
begin
  if v_user is null then raise exception 'Autenticação necessária.'; end if;
  select * into v_opening from public.project_recruiting_openings where id=p_opening_id;
  if not found then raise exception 'Vaga não encontrada.'; end if;
  select * into v_project from public.projects where id=v_opening.project_id;
  if not found or v_project.status='archived' then raise exception 'Projeto indisponível.'; end if;
  if v_opening.status<>'open' then raise exception 'Esta vaga não está recebendo candidaturas.'; end if;
  if v_opening.visibility='team' and not private.current_user_can_view_project_recruiting(v_opening.project_id) then
    raise exception 'Esta oportunidade é restrita à equipe.';
  end if;
  if v_project.owner_id=v_user or exists(
    select 1 from public.project_members pm where pm.project_id=v_opening.project_id and pm.user_id=v_user and pm.status='active'
  ) then
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

  select coalesce(nullif(display_name,''),nullif(username,''),'Membro') into v_actor from public.profiles where id=v_user;

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

create or replace function public.withdraw_project_recruiting_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.project_recruiting_applications
  set status='withdrawn',updated_at=now()
  where id=p_application_id
    and user_id=(select auth.uid())
    and status in ('pending','shortlisted');

  if not found then raise exception 'Candidatura não encontrada ou não pode mais ser retirada.'; end if;
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
  v_actor text;
  v_candidate text;
begin
  if p_status not in ('shortlisted','accepted','rejected') then raise exception 'Status de revisão inválido.'; end if;
  select * into v_app from public.project_recruiting_applications where id=p_application_id;
  if not found then raise exception 'Candidatura não encontrada.'; end if;
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
    set role=case when public.project_members.role='owner' then 'owner' else 'contributor' end,
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

  select coalesce(nullif(display_name,''),nullif(username,''),'CreativeZone') into v_actor from public.profiles where id=v_user;

  insert into public.notifications(user_id,actor_id,type,data)
  values(v_app.user_id,v_user,'project_recruiting_status',jsonb_build_object(
    'project_id',v_project.id,'project_title',v_project.title,'opening_id',v_opening.id,'opening_title',v_opening.title,
    'application_id',v_app.id,'status',p_status,'review_note',trim(coalesce(p_review_note,'')),
    'message',case p_status when 'accepted' then 'Sua candidatura foi aceita.' when 'shortlisted' then 'Sua candidatura avançou para a seleção.' else 'Sua candidatura foi encerrada.' end,
    'path','/projetos/'||v_project.slug
  ));
end;
$$;

revoke all on function public.get_project_recruiting(uuid) from public;
revoke all on function public.get_project_recruiting_applications(uuid) from public;
revoke all on function public.create_project_recruiting_opening(uuid,text,text,text,text,text[],text,text,integer,text) from public;
revoke all on function public.update_project_recruiting_opening(uuid,text,text,text,text,text[],text,text,integer,text,text) from public;
revoke all on function public.apply_project_recruiting(uuid,text,text,text) from public;
revoke all on function public.withdraw_project_recruiting_application(uuid) from public;
revoke all on function public.review_project_recruiting_application(uuid,text,text) from public;

grant execute on function public.get_project_recruiting(uuid) to anon,authenticated;
grant execute on function public.get_project_recruiting_applications(uuid) to authenticated;
grant execute on function public.create_project_recruiting_opening(uuid,text,text,text,text,text[],text,text,integer,text) to authenticated;
grant execute on function public.update_project_recruiting_opening(uuid,text,text,text,text,text[],text,text,integer,text,text) to authenticated;
grant execute on function public.apply_project_recruiting(uuid,text,text,text) to authenticated;
grant execute on function public.withdraw_project_recruiting_application(uuid) to authenticated;
grant execute on function public.review_project_recruiting_application(uuid,text,text) to authenticated;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='project_recruiting_openings') then
    alter publication supabase_realtime add table public.project_recruiting_openings;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='project_recruiting_applications') then
    alter publication supabase_realtime add table public.project_recruiting_applications;
  end if;
end $$;
