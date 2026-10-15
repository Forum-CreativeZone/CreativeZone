grant execute on function private.current_user_can_read_project_kanban(uuid) to anon;

drop policy if exists "project activity readable" on public.project_activity_feed;
create policy "project activity readable"
on public.project_activity_feed for select
to anon,authenticated
using (
  (select private.current_user_can_read_project_activity(project_id))
  and (
    event_type not like 'kanban#_%' escape '#'
    or (select private.current_user_can_read_project_kanban(project_id))
  )
);

create or replace function public.get_project_passport(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_project public.projects%rowtype;
  v_repo public.project_repositories%rowtype;
  v_security public.project_security_state%rowtype;
  v_system_owner boolean := false;
  v_participant boolean := false;
  v_can_view boolean := false;
  v_repo_found boolean := false;
  v_repo_private boolean := false;
  v_sensitive_visible boolean := false;
  v_member_count integer := 0;
  v_pending_count integer := 0;
  v_activity_count integer := 0;
  v_commit_count integer := 0;
  v_pr_count integer := 0;
  v_issue_count integer := 0;
  v_workflow_count integer := 0;
  v_failed_workflow_count integer := 0;
  v_security_event_count integer := 0;
  v_contributor_count integer := 0;
  v_latest_activity jsonb := null;
  v_latest_build jsonb := null;
  v_score integer := 0;
  v_level text := 'Ideia';
  v_release boolean := false;
  v_passport_id text;
  v_age_days integer := 0;
begin
  select * into v_project
  from public.projects
  where id=p_project_id;

  if not found then
    raise exception 'Projeto não encontrado.';
  end if;

  if v_user is not null then
    select coalesce(p.system_owner,false)
      into v_system_owner
    from public.profiles p
    where p.id=v_user;

    select exists(
      select 1
      from public.project_members pm
      where pm.project_id=p_project_id
        and pm.user_id=v_user
        and pm.status='active'
    ) into v_participant;
  end if;

  v_participant := v_participant or v_project.owner_id=v_user or v_system_owner;
  v_can_view := v_project.visibility='public' or v_participant;

  if not v_can_view then
    raise exception 'Você não possui acesso a este projeto.';
  end if;

  select * into v_repo
  from public.project_repositories pr
  where pr.project_id=p_project_id
  order by pr.updated_at desc
  limit 1;
  v_repo_found := found;

  if v_repo_found then
    v_repo_private := coalesce(v_repo.is_private,false);
  else
    select coalesce(gr.private,false)
      into v_repo_private
    from public.github_devhub_repositories gr
    where gr.project_id=p_project_id
      and gr.status='active'
    limit 1;
    v_repo_private := coalesce(v_repo_private,false);
  end if;

  v_sensitive_visible := not v_repo_private or v_participant;

  select count(*) filter(where status='active')::integer,
         count(*) filter(where status='pending')::integer
    into v_member_count,v_pending_count
  from public.project_members
  where project_id=p_project_id;

  if v_sensitive_visible then
    select count(*)::integer,
           count(*) filter(where event_type='commit')::integer,
           count(*) filter(where event_type='pull_request')::integer,
           count(*) filter(where event_type='issues')::integer,
           count(*) filter(where event_type='workflow_run')::integer,
           count(*) filter(where event_type='workflow_run' and status in ('failure','failed','error'))::integer,
           count(*) filter(where source='security')::integer,
           count(distinct coalesce(actor_user_id::text,nullif(actor_label,'')))::integer
      into v_activity_count,v_commit_count,v_pr_count,v_issue_count,v_workflow_count,
           v_failed_workflow_count,v_security_event_count,v_contributor_count
    from public.project_activity_feed
    where project_id=p_project_id
      and occurred_at >= now()-interval '30 days'
      and (v_participant or event_type not like 'kanban#_%' escape '#');

    select jsonb_build_object(
             'id',f.id,
             'source',f.source,
             'event_type',f.event_type,
             'title',f.title,
             'summary',f.summary,
             'status',f.status,
             'occurred_at',f.occurred_at
           )
      into v_latest_activity
    from public.project_activity_feed f
    where f.project_id=p_project_id
      and (v_participant or f.event_type not like 'kanban#_%' escape '#')
    order by f.occurred_at desc
    limit 1;

    select jsonb_build_object(
             'title',f.title,
             'summary',f.summary,
             'status',f.status,
             'occurred_at',f.occurred_at
           )
      into v_latest_build
    from public.project_activity_feed f
    where f.project_id=p_project_id
      and f.event_type='workflow_run'
    order by f.occurred_at desc
    limit 1;

    select * into v_security
    from public.project_security_state s
    where s.project_id=p_project_id;
  end if;

  v_release := v_repo_found
    and v_sensitive_visible
    and coalesce(v_repo.latest_release,'{}'::jsonb) <> '{}'::jsonb;

  -- Maturity score: identity 10, repository 20, team 15, activity 20,
  -- security 20, release 10, website 5.
  if not v_repo_private or v_participant then
    if length(trim(coalesce(v_project.summary,'')))>0 then v_score:=v_score+3; end if;
    if length(trim(coalesce(v_project.description,'')))>0 then v_score:=v_score+4; end if;
    if coalesce(array_length(v_project.tags,1),0)>0 then v_score:=v_score+3; end if;

    if v_project.repo_url is not null or v_repo_found then v_score:=v_score+10; end if;
    if v_repo_found and v_repo.sync_status='ok' then v_score:=v_score+10; end if;

    v_score:=v_score+case
      when v_member_count>=4 then 15
      when v_member_count>=2 then 10
      when v_member_count>=1 then 5
      else 0 end;

    v_score:=v_score+case
      when v_activity_count>=30 then 20
      when v_activity_count>=15 then 15
      when v_activity_count>=5 then 10
      when v_activity_count>=1 then 5
      else 0 end;

    if v_sensitive_visible and v_security.last_audited_at is not null then
      v_score:=v_score+greatest(0,least(20,round(coalesce(v_security.security_score,0)::numeric*0.20)::integer));
    end if;

    if v_release then v_score:=v_score+10; end if;
    if nullif(trim(coalesce(v_project.website_url,'')),'') is not null then v_score:=v_score+5; end if;

    v_score:=greatest(0,least(100,v_score));
    v_level:=case
      when v_score>=85 then 'Maduro'
      when v_score>=70 then 'Operacional'
      when v_score>=50 then 'Em construção'
      when v_score>=30 then 'Fundamentos'
      else 'Ideia'
    end;
  else
    v_level:='Restrito';
  end if;

  v_passport_id:='CZP-'||upper(substr(replace(v_project.id::text,'-',''),1,10));
  v_age_days:=greatest(0,(current_date-v_project.created_at::date));

  return jsonb_build_object(
    'passport_id',v_passport_id,
    'generated_at',now(),
    'project',jsonb_build_object(
      'id',v_project.id,
      'title',v_project.title,
      'slug',v_project.slug,
      'summary',v_project.summary,
      'status',v_project.status,
      'visibility',v_project.visibility,
      'tags',coalesce(to_jsonb(v_project.tags),'[]'::jsonb),
      'skills_needed',coalesce(to_jsonb(v_project.skills_needed),'[]'::jsonb),
      'website_url',v_project.website_url,
      'created_at',v_project.created_at,
      'age_days',v_age_days
    ),
    'team',jsonb_build_object(
      'active_members',v_member_count,
      'pending_requests',case when v_participant then v_pending_count else null end
    ),
    'repository',case
      when not v_repo_found and v_project.repo_url is null then jsonb_build_object('connected',false)
      when not v_sensitive_visible then jsonb_build_object(
        'connected',true,'private',true,'details_restricted',true
      )
      else jsonb_build_object(
        'connected',true,
        'private',coalesce(v_repo.is_private,false),
        'full_name',case when v_repo_found then concat(v_repo.repo_owner,'/',v_repo.repo_name) else null end,
        'repo_url',coalesce(v_repo.repo_url,v_project.repo_url),
        'default_branch',case when v_repo_found then v_repo.default_branch else null end,
        'sync_status',case when v_repo_found then v_repo.sync_status else 'pending' end,
        'last_sync_at',case when v_repo_found then v_repo.last_sync_at else null end,
        'pushed_at',case when v_repo_found then v_repo.pushed_at else null end,
        'primary_language',case when v_repo_found then v_repo.primary_language else null end,
        'languages',case when v_repo_found then coalesce(v_repo.languages,'{}'::jsonb) else '{}'::jsonb end,
        'license',case when v_repo_found then v_repo.license_spdx else null end,
        'stars',case when v_repo_found then v_repo.stargazers_count else 0 end,
        'forks',case when v_repo_found then v_repo.forks_count else 0 end,
        'watchers',case when v_repo_found then v_repo.watchers_count else 0 end,
        'open_issues',case when v_repo_found then v_repo.open_issues_count else 0 end,
        'latest_release',case when v_repo_found then coalesce(v_repo.latest_release,'{}'::jsonb) else '{}'::jsonb end
      )
    end,
    'security',case
      when not v_sensitive_visible then jsonb_build_object('visible',false)
      else jsonb_build_object(
        'visible',true,
        'status',coalesce(v_security.status,'unknown'),
        'score',coalesce(v_security.security_score,100),
        'vulnerabilities',coalesce(v_security.vulnerability_count,0),
        'critical',coalesce(v_security.critical_count,0),
        'high',coalesce(v_security.high_count,0),
        'dependencies',coalesce(v_security.dependency_count,0),
        'last_audited_at',v_security.last_audited_at
      )
    end,
    'activity',case
      when not v_sensitive_visible then jsonb_build_object('visible',false)
      else jsonb_build_object(
        'visible',true,
        'last_30_days',v_activity_count,
        'commits',v_commit_count,
        'pull_requests',v_pr_count,
        'issues',v_issue_count,
        'workflow_runs',v_workflow_count,
        'failed_workflows',v_failed_workflow_count,
        'security_events',v_security_event_count,
        'contributors',v_contributor_count,
        'latest',v_latest_activity,
        'latest_build',v_latest_build
      )
    end,
    'maturity',jsonb_build_object(
      'score',case when v_level='Restrito' then null else v_score end,
      'level',v_level,
      'metrics_restricted',not v_sensitive_visible
    ),
    'proofs',jsonb_build_object(
      'identity_complete',
        length(trim(coalesce(v_project.summary,'')))>0
        and length(trim(coalesce(v_project.description,'')))>0
        and coalesce(array_length(v_project.tags,1),0)>0,
      'repository_connected',v_project.repo_url is not null or v_repo_found,
      'repository_synced',v_repo_found and v_repo.sync_status='ok',
      'team_active',v_member_count>=2,
      'recent_activity',v_activity_count>0,
      'security_audited',v_sensitive_visible and v_security.last_audited_at is not null,
      'release_published',v_release,
      'website_available',nullif(trim(coalesce(v_project.website_url,'')),'') is not null
    )
  );
end;
$$;

revoke all on function public.get_project_passport(uuid) from public;
grant execute on function public.get_project_passport(uuid) to anon,authenticated;
