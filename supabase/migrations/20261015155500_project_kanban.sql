create table if not exists public.project_kanban_columns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  key text not null,
  title text not null check (char_length(title) between 1 and 80),
  position integer not null default 0 check (position >= 0),
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,key)
);

create table if not exists public.project_kanban_cards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  column_id uuid not null references public.project_kanban_columns(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 160),
  description text not null default '' check (char_length(description) <= 5000),
  priority text not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  labels text[] not null default '{}'::text[],
  position integer not null default 0 check (position >= 0),
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  github_issue_number integer check (github_issue_number is null or github_issue_number > 0),
  github_issue_url text,
  github_pr_number integer check (github_pr_number is null or github_pr_number > 0),
  github_pr_url text,
  github_branch text check (github_branch is null or char_length(github_branch) <= 255),
  checklist jsonb not null default '[]'::jsonb
    check (jsonb_typeof(checklist)='array'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_kanban_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  card_id uuid not null references public.project_kanban_cards(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_kanban_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  card_id uuid references public.project_kanban_cards(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action_type text not null,
  from_column_id uuid references public.project_kanban_columns(id) on delete set null,
  to_column_id uuid references public.project_kanban_columns(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists project_kanban_columns_project_position_idx
  on public.project_kanban_columns(project_id,position,id);
create index if not exists project_kanban_cards_column_position_idx
  on public.project_kanban_cards(project_id,column_id,position,id);
create index if not exists project_kanban_cards_assignee_idx
  on public.project_kanban_cards(assignee_id)
  where assignee_id is not null;
create index if not exists project_kanban_comments_card_time_idx
  on public.project_kanban_comments(card_id,created_at);
create index if not exists project_kanban_history_card_time_idx
  on public.project_kanban_history(card_id,created_at desc);

alter table public.project_kanban_columns enable row level security;
alter table public.project_kanban_cards enable row level security;
alter table public.project_kanban_comments enable row level security;
alter table public.project_kanban_history enable row level security;

create or replace function private.current_user_can_read_project_kanban(p_project_id uuid)
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
      where p.id=p_project_id
        and p.owner_id=(select auth.uid())
    )
    or exists(
      select 1 from public.project_members pm
      where pm.project_id=p_project_id
        and pm.user_id=(select auth.uid())
        and pm.status='active'
    ),
    false
  )
$$;

create or replace function private.current_user_can_write_project_kanban(p_project_id uuid)
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
      where p.id=p_project_id
        and p.owner_id=(select auth.uid())
        and p.status <> 'archived'
    )
    or exists(
      select 1 from public.project_members pm
      join public.projects p on p.id=pm.project_id
      where pm.project_id=p_project_id
        and pm.user_id=(select auth.uid())
        and pm.status='active'
        and pm.role in ('maintainer','contributor')
        and p.status <> 'archived'
    ),
    false
  )
$$;

create or replace function private.current_user_can_manage_project_kanban(p_project_id uuid)
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
      where p.id=p_project_id
        and p.owner_id=(select auth.uid())
        and p.status <> 'archived'
    )
    or exists(
      select 1 from public.project_members pm
      join public.projects p on p.id=pm.project_id
      where pm.project_id=p_project_id
        and pm.user_id=(select auth.uid())
        and pm.status='active'
        and pm.role='maintainer'
        and p.status <> 'archived'
    ),
    false
  )
$$;

revoke all on function private.current_user_can_read_project_kanban(uuid) from public;
revoke all on function private.current_user_can_write_project_kanban(uuid) from public;
revoke all on function private.current_user_can_manage_project_kanban(uuid) from public;
grant execute on function private.current_user_can_read_project_kanban(uuid) to authenticated;
grant execute on function private.current_user_can_write_project_kanban(uuid) to authenticated;
grant execute on function private.current_user_can_manage_project_kanban(uuid) to authenticated;

create or replace function private.ensure_project_kanban_columns(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if exists(select 1 from public.project_kanban_columns where project_id=p_project_id) then
    return;
  end if;

  insert into public.project_kanban_columns(project_id,key,title,position,is_done)
  values
    (p_project_id,'backlog','Backlog',100,false),
    (p_project_id,'todo','A fazer',200,false),
    (p_project_id,'in_progress','Em andamento',300,false),
    (p_project_id,'review','Em revisão',400,false),
    (p_project_id,'done','Concluído',500,true)
  on conflict(project_id,key) do nothing;
end;
$$;

revoke all on function private.ensure_project_kanban_columns(uuid) from public;

create or replace function private.valid_project_kanban_assignee(p_project_id uuid,p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select p_user_id is null
    or exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=p_user_id)
    or exists(
      select 1 from public.project_members pm
      where pm.project_id=p_project_id and pm.user_id=p_user_id and pm.status='active'
    )
$$;

revoke all on function private.valid_project_kanban_assignee(uuid,uuid) from public;

drop policy if exists "project kanban columns readable" on public.project_kanban_columns;
create policy "project kanban columns readable"
on public.project_kanban_columns for select to authenticated
using ((select private.current_user_can_read_project_kanban(project_id)));

drop policy if exists "project kanban cards readable" on public.project_kanban_cards;
create policy "project kanban cards readable"
on public.project_kanban_cards for select to authenticated
using ((select private.current_user_can_read_project_kanban(project_id)));

drop policy if exists "project kanban comments readable" on public.project_kanban_comments;
create policy "project kanban comments readable"
on public.project_kanban_comments for select to authenticated
using ((select private.current_user_can_read_project_kanban(project_id)));

drop policy if exists "project kanban history readable" on public.project_kanban_history;
create policy "project kanban history readable"
on public.project_kanban_history for select to authenticated
using ((select private.current_user_can_read_project_kanban(project_id)));

revoke insert,update,delete on public.project_kanban_columns from anon,authenticated;
revoke insert,update,delete on public.project_kanban_cards from anon,authenticated;
revoke insert,update,delete on public.project_kanban_comments from anon,authenticated;
revoke insert,update,delete on public.project_kanban_history from anon,authenticated;
grant select on public.project_kanban_columns to authenticated;
grant select on public.project_kanban_cards to authenticated;
grant select on public.project_kanban_comments to authenticated;
grant select on public.project_kanban_history to authenticated;

create or replace function public.get_project_kanban(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_columns jsonb;
  v_cards jsonb;
  v_can_write boolean;
  v_can_manage boolean;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária.'; end if;
  if not private.current_user_can_read_project_kanban(p_project_id) then
    raise exception 'O Kanban é privado para a equipe deste projeto.';
  end if;

  perform private.ensure_project_kanban_columns(p_project_id);
  v_can_write:=private.current_user_can_write_project_kanban(p_project_id);
  v_can_manage:=private.current_user_can_manage_project_kanban(p_project_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'key',c.key,'title',c.title,'position',c.position,'is_done',c.is_done
  ) order by c.position,c.id),'[]'::jsonb)
  into v_columns
  from public.project_kanban_columns c
  where c.project_id=p_project_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',k.id,'project_id',k.project_id,'column_id',k.column_id,
    'title',k.title,'description',k.description,'priority',k.priority,
    'labels',to_jsonb(k.labels),'position',k.position,
    'assignee_id',k.assignee_id,
    'assignee',case when a.id is null then null else jsonb_build_object(
      'id',a.id,'username',a.username,'display_name',a.display_name,'avatar_url',a.avatar_url
    ) end,
    'created_by',k.created_by,
    'creator',case when cr.id is null then null else jsonb_build_object(
      'id',cr.id,'username',cr.username,'display_name',cr.display_name,'avatar_url',cr.avatar_url
    ) end,
    'due_at',k.due_at,
    'github_issue_number',k.github_issue_number,'github_issue_url',k.github_issue_url,
    'github_pr_number',k.github_pr_number,'github_pr_url',k.github_pr_url,
    'github_branch',k.github_branch,'checklist',k.checklist,
    'completed_at',k.completed_at,'created_at',k.created_at,'updated_at',k.updated_at,
    'comments_count',(select count(*) from public.project_kanban_comments cm where cm.card_id=k.id)
  ) order by k.position,k.created_at,k.id),'[]'::jsonb)
  into v_cards
  from public.project_kanban_cards k
  left join public.profiles a on a.id=k.assignee_id
  left join public.profiles cr on cr.id=k.created_by
  where k.project_id=p_project_id;

  return jsonb_build_object(
    'columns',v_columns,
    'cards',v_cards,
    'permissions',jsonb_build_object('can_write',v_can_write,'can_manage',v_can_manage)
  );
end;
$$;

create or replace function public.get_project_kanban_card(p_card_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_project uuid;
  v_card jsonb;
  v_comments jsonb;
  v_history jsonb;
begin
  select project_id into v_project from public.project_kanban_cards where id=p_card_id;
  if not found then raise exception 'Card não encontrado.'; end if;
  if not private.current_user_can_read_project_kanban(v_project) then
    raise exception 'Acesso ao Kanban negado.';
  end if;

  select jsonb_build_object(
    'id',k.id,'project_id',k.project_id,'column_id',k.column_id,
    'title',k.title,'description',k.description,'priority',k.priority,
    'labels',to_jsonb(k.labels),'position',k.position,
    'assignee_id',k.assignee_id,
    'assignee',case when a.id is null then null else jsonb_build_object(
      'id',a.id,'username',a.username,'display_name',a.display_name,'avatar_url',a.avatar_url
    ) end,
    'created_by',k.created_by,
    'creator',case when cr.id is null then null else jsonb_build_object(
      'id',cr.id,'username',cr.username,'display_name',cr.display_name,'avatar_url',cr.avatar_url
    ) end,
    'due_at',k.due_at,'github_issue_number',k.github_issue_number,'github_issue_url',k.github_issue_url,
    'github_pr_number',k.github_pr_number,'github_pr_url',k.github_pr_url,'github_branch',k.github_branch,
    'checklist',k.checklist,'completed_at',k.completed_at,'created_at',k.created_at,'updated_at',k.updated_at
  )
  into v_card
  from public.project_kanban_cards k
  left join public.profiles a on a.id=k.assignee_id
  left join public.profiles cr on cr.id=k.created_by
  where k.id=p_card_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',cm.id,'content',cm.content,'created_at',cm.created_at,'updated_at',cm.updated_at,
    'user',jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url)
  ) order by cm.created_at),'[]'::jsonb)
  into v_comments
  from public.project_kanban_comments cm
  join public.profiles p on p.id=cm.user_id
  where cm.card_id=p_card_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',h.id,'action_type',h.action_type,'metadata',h.metadata,'created_at',h.created_at,
    'from_column_id',h.from_column_id,'to_column_id',h.to_column_id,
    'actor',case when p.id is null then null else jsonb_build_object(
      'id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url
    ) end
  ) order by h.created_at desc),'[]'::jsonb)
  into v_history
  from public.project_kanban_history h
  left join public.profiles p on p.id=h.actor_id
  where h.card_id=p_card_id;

  return jsonb_build_object(
    'card',v_card,'comments',v_comments,'history',v_history,
    'permissions',jsonb_build_object(
      'can_write',private.current_user_can_write_project_kanban(v_project),
      'can_manage',private.current_user_can_manage_project_kanban(v_project)
    )
  );
end;
$$;

create or replace function public.create_project_kanban_card(
  p_project_id uuid,
  p_column_id uuid,
  p_title text,
  p_description text default '',
  p_priority text default 'normal',
  p_labels text[] default '{}'::text[],
  p_assignee_id uuid default null,
  p_due_at timestamptz default null,
  p_github_issue_number integer default null,
  p_github_issue_url text default null,
  p_github_pr_number integer default null,
  p_github_pr_url text default null,
  p_github_branch text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_card uuid;
  v_position integer;
  v_label text;
begin
  if v_user is null then raise exception 'Autenticação necessária.'; end if;
  if not private.current_user_can_write_project_kanban(p_project_id) then
    raise exception 'Sua função não permite criar cards no Kanban.';
  end if;
  if char_length(trim(coalesce(p_title,'')))<3 then raise exception 'Informe um título com pelo menos 3 caracteres.'; end if;
  if char_length(coalesce(p_description,''))>5000 then raise exception 'Descrição muito longa.'; end if;
  if p_priority not in ('low','normal','high','urgent') then raise exception 'Prioridade inválida.'; end if;
  if coalesce(array_length(p_labels,1),0)>12 then raise exception 'Use no máximo 12 labels.'; end if;
  if not exists(select 1 from public.project_kanban_columns c where c.id=p_column_id and c.project_id=p_project_id) then
    raise exception 'Coluna inválida.';
  end if;
  if not private.valid_project_kanban_assignee(p_project_id,p_assignee_id) then
    raise exception 'Responsável precisa fazer parte do projeto.';
  end if;

  select coalesce(max(position),0)+100 into v_position
  from public.project_kanban_cards
  where project_id=p_project_id and column_id=p_column_id;

  insert into public.project_kanban_cards(
    project_id,column_id,title,description,priority,labels,position,assignee_id,created_by,updated_by,
    due_at,github_issue_number,github_issue_url,github_pr_number,github_pr_url,github_branch
  ) values(
    p_project_id,p_column_id,trim(p_title),coalesce(p_description,''),p_priority,coalesce(p_labels,'{}'::text[]),
    v_position,p_assignee_id,v_user,v_user,p_due_at,p_github_issue_number,nullif(trim(coalesce(p_github_issue_url,'')),''),
    p_github_pr_number,nullif(trim(coalesce(p_github_pr_url,'')),''),nullif(trim(coalesce(p_github_branch,'')),'')
  ) returning id into v_card;

  insert into public.project_kanban_history(project_id,card_id,actor_id,action_type,to_column_id,metadata)
  values(p_project_id,v_card,v_user,'created',p_column_id,jsonb_build_object('title',trim(p_title)));

  select coalesce(nullif(display_name,''),nullif(username,''),'Membro') into v_label
  from public.profiles where id=v_user;

  insert into public.project_activity_feed(
    project_id,source,event_type,event_key,actor_user_id,actor_label,title,summary,status,metadata,occurred_at
  ) values(
    p_project_id,'creativezone','kanban_card_created','kanban:create:'||v_card,v_user,coalesce(v_label,'Membro'),
    coalesce(v_label,'Membro')||' criou um card no Kanban',trim(p_title),'created',
    jsonb_build_object('card_id',v_card),now()
  ) on conflict(project_id,event_key) do nothing;

  return v_card;
end;
$$;

create or replace function public.update_project_kanban_card(
  p_card_id uuid,
  p_title text,
  p_description text,
  p_priority text,
  p_labels text[],
  p_assignee_id uuid,
  p_due_at timestamptz,
  p_github_issue_number integer,
  p_github_issue_url text,
  p_github_pr_number integer,
  p_github_pr_url text,
  p_github_branch text,
  p_checklist jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_project uuid;
begin
  select project_id into v_project from public.project_kanban_cards where id=p_card_id;
  if not found then raise exception 'Card não encontrado.'; end if;
  if not private.current_user_can_write_project_kanban(v_project) then
    raise exception 'Sua função não permite editar cards.';
  end if;
  if char_length(trim(coalesce(p_title,'')))<3 then raise exception 'Informe um título com pelo menos 3 caracteres.'; end if;
  if char_length(coalesce(p_description,''))>5000 then raise exception 'Descrição muito longa.'; end if;
  if p_priority not in ('low','normal','high','urgent') then raise exception 'Prioridade inválida.'; end if;
  if coalesce(array_length(p_labels,1),0)>12 then raise exception 'Use no máximo 12 labels.'; end if;
  if jsonb_typeof(coalesce(p_checklist,'[]'::jsonb))<>'array' then raise exception 'Checklist inválido.'; end if;
  if jsonb_array_length(coalesce(p_checklist,'[]'::jsonb))>50 then raise exception 'Use no máximo 50 itens no checklist.'; end if;
  if not private.valid_project_kanban_assignee(v_project,p_assignee_id) then
    raise exception 'Responsável precisa fazer parte do projeto.';
  end if;

  update public.project_kanban_cards
  set title=trim(p_title),description=coalesce(p_description,''),priority=p_priority,
      labels=coalesce(p_labels,'{}'::text[]),assignee_id=p_assignee_id,due_at=p_due_at,
      github_issue_number=p_github_issue_number,github_issue_url=nullif(trim(coalesce(p_github_issue_url,'')),''),
      github_pr_number=p_github_pr_number,github_pr_url=nullif(trim(coalesce(p_github_pr_url,'')),''),
      github_branch=nullif(trim(coalesce(p_github_branch,'')),''),
      checklist=coalesce(p_checklist,'[]'::jsonb),updated_by=v_user,updated_at=now()
  where id=p_card_id;

  insert into public.project_kanban_history(project_id,card_id,actor_id,action_type,metadata)
  values(v_project,p_card_id,v_user,'updated',jsonb_build_object('title',trim(p_title)));
end;
$$;

create or replace function public.move_project_kanban_card(p_card_id uuid,p_column_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_project uuid;
  v_from uuid;
  v_title text;
  v_to_done boolean;
  v_from_done boolean;
  v_position integer;
  v_action text;
  v_label text;
begin
  select k.project_id,k.column_id,k.title,c.is_done
    into v_project,v_from,v_title,v_from_done
  from public.project_kanban_cards k
  join public.project_kanban_columns c on c.id=k.column_id
  where k.id=p_card_id;
  if not found then raise exception 'Card não encontrado.'; end if;
  if not private.current_user_can_write_project_kanban(v_project) then
    raise exception 'Sua função não permite mover cards.';
  end if;

  select is_done into v_to_done
  from public.project_kanban_columns
  where id=p_column_id and project_id=v_project;
  if not found then raise exception 'Coluna inválida.'; end if;

  select coalesce(max(position),0)+100 into v_position
  from public.project_kanban_cards
  where project_id=v_project and column_id=p_column_id and id<>p_card_id;

  update public.project_kanban_cards
  set column_id=p_column_id,position=v_position,updated_by=v_user,updated_at=now(),
      completed_at=case when v_to_done then coalesce(completed_at,now()) else null end
  where id=p_card_id;

  v_action:=case
    when v_to_done and not v_from_done then 'completed'
    when not v_to_done and v_from_done then 'reopened'
    else 'moved'
  end;

  insert into public.project_kanban_history(project_id,card_id,actor_id,action_type,from_column_id,to_column_id,metadata)
  values(v_project,p_card_id,v_user,v_action,v_from,p_column_id,jsonb_build_object('title',v_title));

  if v_action in ('completed','reopened') then
    select coalesce(nullif(display_name,''),nullif(username,''),'Membro') into v_label
    from public.profiles where id=v_user;

    insert into public.project_activity_feed(
      project_id,source,event_type,event_key,actor_user_id,actor_label,title,summary,status,metadata,occurred_at
    ) values(
      v_project,'creativezone',
      case when v_action='completed' then 'kanban_card_completed' else 'kanban_card_reopened' end,
      'kanban:'||v_action||':'||p_card_id||':'||extract(epoch from now())::bigint,
      v_user,coalesce(v_label,'Membro'),
      coalesce(v_label,'Membro')||case when v_action='completed' then ' concluiu um card' else ' reabriu um card' end,
      v_title,case when v_action='completed' then 'success' else 'reopened' end,
      jsonb_build_object('card_id',p_card_id),now()
    );
  end if;
end;
$$;

create or replace function public.delete_project_kanban_card(p_card_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_project uuid;
  v_creator uuid;
  v_title text;
begin
  select project_id,created_by,title into v_project,v_creator,v_title
  from public.project_kanban_cards where id=p_card_id;
  if not found then raise exception 'Card não encontrado.'; end if;
  if not private.current_user_can_manage_project_kanban(v_project) and v_creator<>v_user then
    raise exception 'Somente o criador, Maintainer ou dono pode excluir este card.';
  end if;

  insert into public.project_kanban_history(project_id,card_id,actor_id,action_type,metadata)
  values(v_project,p_card_id,v_user,'deleted',jsonb_build_object('title',v_title));

  delete from public.project_kanban_cards where id=p_card_id;
end;
$$;

create or replace function public.add_project_kanban_comment(p_card_id uuid,p_content text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_project uuid;
  v_id uuid;
begin
  select project_id into v_project from public.project_kanban_cards where id=p_card_id;
  if not found then raise exception 'Card não encontrado.'; end if;
  if not private.current_user_can_write_project_kanban(v_project) then
    raise exception 'Sua função não permite comentar neste Kanban.';
  end if;
  if char_length(trim(coalesce(p_content,'')))<1 or char_length(p_content)>4000 then
    raise exception 'Comentário inválido.';
  end if;

  insert into public.project_kanban_comments(project_id,card_id,user_id,content)
  values(v_project,p_card_id,v_user,trim(p_content))
  returning id into v_id;

  insert into public.project_kanban_history(project_id,card_id,actor_id,action_type,metadata)
  values(v_project,p_card_id,v_user,'commented',jsonb_build_object('comment_id',v_id));

  return v_id;
end;
$$;

revoke all on function public.get_project_kanban(uuid) from public;
revoke all on function public.get_project_kanban_card(uuid) from public;
revoke all on function public.create_project_kanban_card(uuid,uuid,text,text,text,text[],uuid,timestamptz,integer,text,integer,text,text) from public;
revoke all on function public.update_project_kanban_card(uuid,text,text,text,text[],uuid,timestamptz,integer,text,integer,text,text,jsonb) from public;
revoke all on function public.move_project_kanban_card(uuid,uuid) from public;
revoke all on function public.delete_project_kanban_card(uuid) from public;
revoke all on function public.add_project_kanban_comment(uuid,text) from public;

grant execute on function public.get_project_kanban(uuid) to authenticated;
grant execute on function public.get_project_kanban_card(uuid) to authenticated;
grant execute on function public.create_project_kanban_card(uuid,uuid,text,text,text,text[],uuid,timestamptz,integer,text,integer,text,text) to authenticated;
grant execute on function public.update_project_kanban_card(uuid,text,text,text,text[],uuid,timestamptz,integer,text,integer,text,text,jsonb) to authenticated;
grant execute on function public.move_project_kanban_card(uuid,uuid) to authenticated;
grant execute on function public.delete_project_kanban_card(uuid) to authenticated;
grant execute on function public.add_project_kanban_comment(uuid,text) to authenticated;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='project_kanban_columns') then
    alter publication supabase_realtime add table public.project_kanban_columns;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='project_kanban_cards') then
    alter publication supabase_realtime add table public.project_kanban_cards;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='project_kanban_comments') then
    alter publication supabase_realtime add table public.project_kanban_comments;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='project_kanban_history') then
    alter publication supabase_realtime add table public.project_kanban_history;
  end if;
end $$;
