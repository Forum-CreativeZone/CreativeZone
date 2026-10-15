create or replace function public.get_contribution_passport(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_viewer uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_is_self boolean := false;
  v_system_owner boolean := false;
  v_github jsonb := null;

  v_total integer := 0;
  v_commits integer := 0;
  v_pr_events integer := 0;
  v_pr_merged integer := 0;
  v_reviews integer := 0;
  v_issues integer := 0;
  v_releases integer := 0;
  v_updates integer := 0;
  v_projects integer := 0;
  v_owned_projects integer := 0;
  v_active_days_90 integer := 0;
  v_event_types integer := 0;

  v_current_30 integer := 0;
  v_previous_30 integer := 0;
  v_trend text := 'stable';
  v_trend_delta integer := 0;
  v_trend_percent integer := 0;

  v_delivery integer := 0;
  v_collaboration integer := 0;
  v_consistency integer := 0;
  v_breadth integer := 0;
  v_leadership integer := 0;
  v_score integer := 0;
  v_level text := 'Explorador';

  v_latest jsonb := null;
  v_projects_json jsonb := '[]'::jsonb;
  v_months jsonb := '[]'::jsonb;
  v_areas jsonb := '[]'::jsonb;
  v_internal jsonb := null;
  v_passport_id text;
begin
  select * into v_profile
  from public.profiles
  where id=p_user_id;

  if not found then raise exception 'Membro não encontrado.'; end if;

  v_passport_id:='CZC-'||upper(substr(replace(p_user_id::text,'-',''),1,10));
  v_is_self := v_viewer=p_user_id;
  if v_viewer is not null then
    v_system_owner := private.is_system_owner(v_viewer);
  end if;

  select jsonb_build_object(
    'connected',true,
    'username',c.github_username,
    'profile_url',c.profile_url,
    'avatar_url',c.avatar_url,
    'last_verified_at',c.last_verified_at
  )
  into v_github
  from public.github_connections c
  where c.user_id=p_user_id
  limit 1;

  if not coalesce(v_profile.show_activity,true) and not v_is_self and not v_system_owner then
    return jsonb_build_object(
      'passport_id',v_passport_id,
      'generated_at',now(),
      'hidden',true,
      'profile',jsonb_build_object(
        'id',v_profile.id,
        'username',v_profile.username,
        'display_name',v_profile.display_name,
        'avatar_url',v_profile.avatar_url
      ),
      'github',jsonb_build_object('connected',false),
      'internal',jsonb_build_object('visible',false)
    );
  end if;

  with public_events as (
    select f.*
    from public.project_activity_feed f
    join public.projects p on p.id=f.project_id
    where f.actor_user_id=p_user_id
      and p.visibility='public'
      and f.event_type not like 'kanban#_%' escape '#'
      and (
        f.source='creativezone'
        or (
          f.source='github'
          and not exists(
            select 1 from public.project_repositories pr
            where pr.project_id=f.project_id and pr.is_private=true
          )
          and not exists(
            select 1 from public.github_devhub_repositories gr
            where gr.project_id=f.project_id and gr.status='active' and gr.private=true
          )
        )
      )
  )
  select
    count(*)::integer,
    count(*) filter(where event_type='commit')::integer,
    count(*) filter(where event_type='pull_request')::integer,
    count(*) filter(where event_type='pull_request' and status='merged')::integer,
    count(*) filter(where event_type='pull_request_review')::integer,
    count(*) filter(where event_type='issues')::integer,
    count(*) filter(where event_type='release')::integer,
    count(*) filter(where event_type='project_update')::integer,
    count(distinct project_id)::integer,
    count(distinct occurred_at::date) filter(where occurred_at>=now()-interval '90 days')::integer,
    count(distinct event_type)::integer,
    count(*) filter(where occurred_at>=now()-interval '30 days')::integer,
    count(*) filter(where occurred_at>=now()-interval '60 days' and occurred_at<now()-interval '30 days')::integer
  into
    v_total,v_commits,v_pr_events,v_pr_merged,v_reviews,v_issues,v_releases,v_updates,
    v_projects,v_active_days_90,v_event_types,v_current_30,v_previous_30
  from public_events;

  select count(*)::integer into v_owned_projects
  from public.projects p
  where p.owner_id=p_user_id and p.visibility='public' and p.status<>'archived';

  v_delivery :=
    least(12, floor(v_commits::numeric/5)::integer)
    + least(12, v_pr_merged*6)
    + least(6, v_releases*6);

  v_collaboration :=
    least(15, v_reviews*3)
    + least(10, v_updates*2);

  v_consistency := least(20,v_active_days_90);
  v_breadth := least(10,v_projects*5) + least(5,v_event_types);
  v_leadership := least(10,v_owned_projects*5);

  v_score := greatest(0,least(100,
    v_delivery+v_collaboration+v_consistency+v_breadth+v_leadership
  ));

  v_level := case
    when v_score>=90 then 'Referência'
    when v_score>=80 then 'Maintainer'
    when v_score>=60 then 'Colaborador'
    when v_score>=40 then 'Builder'
    when v_score>=20 then 'Contributor'
    else 'Explorador'
  end;

  v_trend_delta:=v_current_30-v_previous_30;
  v_trend:=case when v_trend_delta>0 then 'up' when v_trend_delta<0 then 'down' else 'stable' end;
  v_trend_percent:=case
    when v_previous_30>0 then round((v_trend_delta::numeric/v_previous_30::numeric)*100)::integer
    when v_current_30>0 then 100
    else 0 end;

  with public_events as (
    select f.*
    from public.project_activity_feed f
    join public.projects p on p.id=f.project_id
    where f.actor_user_id=p_user_id
      and p.visibility='public'
      and f.event_type not like 'kanban#_%' escape '#'
      and (
        f.source='creativezone'
        or (
          f.source='github'
          and not exists(select 1 from public.project_repositories pr where pr.project_id=f.project_id and pr.is_private=true)
          and not exists(select 1 from public.github_devhub_repositories gr where gr.project_id=f.project_id and gr.status='active' and gr.private=true)
        )
      )
  )
  select jsonb_build_object(
    'project_id',e.project_id,
    'event_type',e.event_type,
    'title',e.title,
    'summary',e.summary,
    'status',e.status,
    'target_url',e.target_url,
    'occurred_at',e.occurred_at
  )
  into v_latest
  from public_events e
  order by e.occurred_at desc
  limit 1;

  with months as (
    select generate_series(
      date_trunc('month',now())-interval '5 months',
      date_trunc('month',now()),
      interval '1 month'
    ) as month_start
  ),
  public_events as (
    select f.occurred_at
    from public.project_activity_feed f
    join public.projects p on p.id=f.project_id
    where f.actor_user_id=p_user_id
      and p.visibility='public'
      and f.event_type not like 'kanban#_%' escape '#'
      and (
        f.source='creativezone'
        or (
          f.source='github'
          and not exists(select 1 from public.project_repositories pr where pr.project_id=f.project_id and pr.is_private=true)
          and not exists(select 1 from public.github_devhub_repositories gr where gr.project_id=f.project_id and gr.status='active' and gr.private=true)
        )
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'month',to_char(m.month_start,'YYYY-MM'),
    'label',to_char(m.month_start,'Mon'),
    'count',(select count(*) from public_events e where e.occurred_at>=m.month_start and e.occurred_at<m.month_start+interval '1 month')
  ) order by m.month_start),'[]'::jsonb)
  into v_months
  from months m;

  with public_events as (
    select f.*
    from public.project_activity_feed f
    join public.projects p on p.id=f.project_id
    where f.actor_user_id=p_user_id
      and p.visibility='public'
      and f.event_type not like 'kanban#_%' escape '#'
      and (
        f.source='creativezone'
        or (
          f.source='github'
          and not exists(select 1 from public.project_repositories pr where pr.project_id=f.project_id and pr.is_private=true)
          and not exists(select 1 from public.github_devhub_repositories gr where gr.project_id=f.project_id and gr.status='active' and gr.private=true)
        )
      )
  ),
  project_ids as (
    select distinct project_id from public_events
    union
    select p.id from public.projects p where p.owner_id=p_user_id and p.visibility='public' and p.status<>'archived'
    union
    select pm.project_id from public.project_members pm
      join public.projects p on p.id=pm.project_id
      where pm.user_id=p_user_id and pm.status='active' and p.visibility='public'
  ),
  area_rows as (
    select unnest(coalesce(p.tags,'{}'::text[])) as area
    from public.projects p join project_ids x on x.project_id=p.id
    union all
    select pr.primary_language
    from public.project_repositories pr join project_ids x on x.project_id=pr.project_id
    where pr.primary_language is not null and pr.is_private=false
  ),
  ranked as (
    select area,count(*)::integer as weight
    from area_rows
    where nullif(trim(area),'') is not null
    group by area
    order by weight desc,area
    limit 10
  )
  select coalesce(jsonb_agg(jsonb_build_object('name',area,'weight',weight) order by weight desc,area),'[]'::jsonb)
  into v_areas
  from ranked;

  with visible_projects as (
    select p.id,p.title,p.slug,p.status,p.owner_id,
           case
             when p.owner_id=p_user_id then 'owner'
             else coalesce((select pm.role from public.project_members pm where pm.project_id=p.id and pm.user_id=p_user_id and pm.status='active' limit 1),'contributor')
           end as relationship
    from public.projects p
    where p.visibility='public'
      and p.status<>'archived'
      and (
        p.owner_id=p_user_id
        or exists(select 1 from public.project_members pm where pm.project_id=p.id and pm.user_id=p_user_id and pm.status='active')
        or exists(select 1 from public.project_activity_feed f where f.project_id=p.id and f.actor_user_id=p_user_id)
      )
  ),
  rows as (
    select vp.*,
      (select count(*) from public.project_activity_feed f
        where f.project_id=vp.id and f.actor_user_id=p_user_id
          and f.occurred_at>=now()-interval '90 days'
          and f.event_type not like 'kanban#_%' escape '#'
          and (
            f.source='creativezone'
            or (
              f.source='github'
              and not exists(select 1 from public.project_repositories pr where pr.project_id=vp.id and pr.is_private=true)
              and not exists(select 1 from public.github_devhub_repositories gr where gr.project_id=vp.id and gr.status='active' and gr.private=true)
            )
          )
      )::integer as activity_90d,
      (select count(*) from public.project_activity_feed f
        where f.project_id=vp.id and f.actor_user_id=p_user_id and f.event_type='commit'
          and f.event_type not like 'kanban#_%' escape '#'
          and not exists(select 1 from public.project_repositories pr where pr.project_id=vp.id and pr.is_private=true)
          and not exists(select 1 from public.github_devhub_repositories gr where gr.project_id=vp.id and gr.status='active' and gr.private=true)
      )::integer as commits,
      (select max(f.occurred_at) from public.project_activity_feed f
        where f.project_id=vp.id and f.actor_user_id=p_user_id
          and f.event_type not like 'kanban#_%' escape '#'
      ) as last_activity
    from visible_projects vp
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'title',r.title,'slug',r.slug,'status',r.status,'relationship',r.relationship,
    'activity_90d',r.activity_90d,'commits',r.commits,'last_activity',r.last_activity
  ) order by r.activity_90d desc,r.last_activity desc nulls last),'[]'::jsonb)
  into v_projects_json
  from rows r;

  if v_is_self or v_system_owner then
    select jsonb_build_object(
      'visible',true,
      'cards_completed',(select count(*) from public.project_kanban_cards k where k.assignee_id=p_user_id and k.completed_at is not null),
      'cards_created',(select count(*) from public.project_kanban_cards k where k.created_by=p_user_id),
      'kanban_comments',(select count(*) from public.project_kanban_comments c where c.user_id=p_user_id),
      'private_project_memberships',(
        select count(*) from public.project_members pm
        join public.projects p on p.id=pm.project_id
        where pm.user_id=p_user_id and pm.status='active' and p.visibility<>'public'
      )
    ) into v_internal;
  else
    v_internal:=jsonb_build_object('visible',false);
  end if;

  return jsonb_build_object(
    'passport_id',v_passport_id,
    'generated_at',now(),
    'profile',jsonb_build_object(
      'id',v_profile.id,
      'username',v_profile.username,
      'display_name',v_profile.display_name,
      'avatar_url',v_profile.avatar_url,
      'occupation',v_profile.occupation,
      'created_at',v_profile.created_at
    ),
    'github',coalesce(v_github,jsonb_build_object('connected',false)),
    'score',jsonb_build_object(
      'total',v_score,
      'level',v_level,
      'dimensions',jsonb_build_object(
        'delivery',jsonb_build_object('score',v_delivery,'max',30),
        'collaboration',jsonb_build_object('score',v_collaboration,'max',25),
        'consistency',jsonb_build_object('score',v_consistency,'max',20),
        'breadth',jsonb_build_object('score',v_breadth,'max',15),
        'leadership',jsonb_build_object('score',v_leadership,'max',10)
      )
    ),
    'metrics',jsonb_build_object(
      'total_events',v_total,
      'commits',v_commits,
      'pull_request_events',v_pr_events,
      'merged_pull_requests',v_pr_merged,
      'reviews',v_reviews,
      'issues',v_issues,
      'releases',v_releases,
      'project_updates',v_updates,
      'projects',v_projects,
      'owned_projects',v_owned_projects,
      'active_days_90',v_active_days_90,
      'event_types',v_event_types
    ),
    'momentum',jsonb_build_object(
      'current_30',v_current_30,
      'previous_30',v_previous_30,
      'delta',v_trend_delta,
      'percent',v_trend_percent,
      'trend',v_trend
    ),
    'latest',v_latest,
    'timeline',v_months,
    'areas',v_areas,
    'projects',v_projects_json,
    'internal',v_internal,
    'methodology',jsonb_build_object(
      'delivery','Commits com teto de 12 pontos, PRs mergeados até 12 e releases até 6.',
      'collaboration','Reviews até 15 pontos e atualizações públicas de projeto até 10.',
      'consistency','Até 20 pontos por dias ativos distintos nos últimos 90 dias.',
      'breadth','Até 10 pontos por projetos com contribuição e 5 pela diversidade de tipos de atividade.',
      'leadership','Até 10 pontos por projetos públicos liderados.',
      'anti_spam','Cada dimensão possui teto próprio: volume infinito de commits não domina a pontuação.'
    )
  );
end;
$$;

revoke all on function public.get_contribution_passport(uuid) from public;
grant execute on function public.get_contribution_passport(uuid) to anon,authenticated;
