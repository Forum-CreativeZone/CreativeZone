create or replace function public.get_project_kanban(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_columns jsonb;
  v_cards jsonb;
  v_user uuid:=auth.uid();
  v_can_write boolean;
  v_can_participate boolean;
  v_can_comment boolean;
  v_can_manage boolean;
begin
  if v_user is null then raise exception 'Autenticação necessária.'; end if;
  if not private.current_user_can_read_project_kanban(p_project_id) then
    raise exception 'O Kanban é privado para a equipe deste projeto.';
  end if;

  perform private.ensure_project_kanban_columns(p_project_id);
  v_can_write:=private.project_has_capability(p_project_id,'kanban_write',v_user);
  v_can_participate:=private.project_has_capability(p_project_id,'kanban_participate',v_user);
  v_can_comment:=private.project_has_capability(p_project_id,'kanban_comment',v_user);
  v_can_manage:=private.project_has_capability(p_project_id,'kanban_manage',v_user);

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
    'permissions',jsonb_build_object(
      'can_write',v_can_write,
      'can_participate',v_can_participate,
      'can_comment',v_can_comment,
      'can_manage',v_can_manage
    )
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
  v_user uuid:=auth.uid();
  v_card jsonb;
  v_comments jsonb;
  v_history jsonb;
begin
  select project_id into v_project from public.project_kanban_cards where id=p_card_id;
  if not found then raise exception 'Card não encontrado.'; end if;
  if not private.current_user_can_read_project_kanban(v_project) then raise exception 'Acesso ao Kanban negado.'; end if;

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
  from public.project_kanban_comments cm join public.profiles p on p.id=cm.user_id
  where cm.card_id=p_card_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',h.id,'action_type',h.action_type,'metadata',h.metadata,'created_at',h.created_at,
    'from_column_id',h.from_column_id,'to_column_id',h.to_column_id,
    'actor',case when p.id is null then null else jsonb_build_object(
      'id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url
    ) end
  ) order by h.created_at desc),'[]'::jsonb)
  into v_history
  from public.project_kanban_history h left join public.profiles p on p.id=h.actor_id
  where h.card_id=p_card_id;

  return jsonb_build_object(
    'card',v_card,'comments',v_comments,'history',v_history,
    'permissions',jsonb_build_object(
      'can_write',private.project_has_capability(v_project,'kanban_write',v_user),
      'can_participate',private.project_has_capability(v_project,'kanban_participate',v_user),
      'can_comment',private.project_has_capability(v_project,'kanban_comment',v_user),
      'can_manage',private.project_has_capability(v_project,'kanban_manage',v_user)
    )
  );
end;
$$;
