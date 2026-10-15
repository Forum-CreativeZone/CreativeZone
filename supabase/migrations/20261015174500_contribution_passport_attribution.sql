create or replace function private.sync_project_github_event_activity(p_event public.project_github_events)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_payload jsonb := coalesce(p_event.payload,'{}'::jsonb);
  v_item jsonb;
  v_login text;
  v_fallback text;
  v_avatar text;
  v_actor uuid;
  v_label text;
  v_profile_avatar text;
  v_key text;
  v_title text;
  v_summary text;
  v_status text;
  v_url text;
  v_number text;
  v_action text := coalesce(p_event.action,'');
  v_occurred timestamptz := coalesce(p_event.received_at,p_event.created_at,now());
begin
  if p_event.project_id is null then return; end if;

  if p_event.event_type='push' then
    for v_item in select value from jsonb_array_elements(coalesce(v_payload->'commits','[]'::jsonb))
    loop
      v_login:=coalesce(v_item#>>'{author,username}',v_payload#>>'{sender,login}');
      v_fallback:=coalesce(v_item#>>'{author,name}',v_login,'GitHub');
      v_avatar:=v_payload#>>'{sender,avatar_url}';
      select a.user_id,a.label,a.avatar_url into v_actor,v_label,v_profile_avatar
      from private.github_actor(v_login,v_fallback,v_avatar) a;
      v_key:=coalesce(p_event.delivery_id,p_event.id::text)||':commit:'||coalesce(v_item->>'id',gen_random_uuid()::text);
      v_summary:=split_part(coalesce(v_item->>'message','Commit no GitHub'),E'\n',1);
      v_url:=v_item->>'url';
      begin v_occurred:=coalesce((v_item->>'timestamp')::timestamptz,v_occurred); exception when others then null; end;
      insert into public.project_activity_feed(
        project_id,source,event_type,event_key,actor_user_id,actor_label,actor_avatar_url,title,summary,status,target_url,metadata,occurred_at
      ) values(
        p_event.project_id,'github','commit',v_key,v_actor,v_label,v_profile_avatar,
        v_label||' fez commit',v_summary,'success',v_url,
        jsonb_build_object(
          'sha',v_item->>'id',
          'branch',regexp_replace(coalesce(v_payload->>'ref',''),'refs/heads/',''),
          'repository',p_event.repository_full_name
        ),v_occurred
      ) on conflict(project_id,event_key) do update set
        actor_user_id=excluded.actor_user_id,actor_label=excluded.actor_label,actor_avatar_url=excluded.actor_avatar_url,
        title=excluded.title,summary=excluded.summary,status=excluded.status,target_url=excluded.target_url,
        metadata=excluded.metadata,occurred_at=excluded.occurred_at;
    end loop;
    return;
  end if;

  if p_event.event_type='pull_request' and v_action in ('opened','reopened','closed','ready_for_review') then
    v_login:=coalesce(v_payload#>>'{pull_request,user,login}',v_payload#>>'{sender,login}');
    v_fallback:=coalesce(v_payload#>>'{pull_request,user,login}',v_login,'GitHub');
    v_avatar:=coalesce(v_payload#>>'{pull_request,user,avatar_url}',v_payload#>>'{sender,avatar_url}');
    select a.user_id,a.label,a.avatar_url into v_actor,v_label,v_profile_avatar from private.github_actor(v_login,v_fallback,v_avatar) a;
    v_number:=coalesce(v_payload#>>'{pull_request,number}',v_payload->>'number','?');
    v_status:=case when coalesce((v_payload#>>'{pull_request,merged}')::boolean,false) then 'merged' else coalesce(v_payload#>>'{pull_request,state}',v_action) end;
    v_title:=case
      when coalesce((v_payload#>>'{pull_request,merged}')::boolean,false) then v_label||' fez merge do PR #'||v_number
      when v_action='opened' then v_label||' abriu PR #'||v_number
      when v_action='reopened' then v_label||' reabriu PR #'||v_number
      when v_action='closed' then v_label||' fechou PR #'||v_number
      else v_label||' marcou PR #'||v_number||' como pronto para review'
    end;
    v_summary:=coalesce(v_payload#>>'{pull_request,title}','Pull Request');
    v_url:=v_payload#>>'{pull_request,html_url}';
    v_key:=coalesce(p_event.delivery_id,p_event.id::text)||':pr';
  elsif p_event.event_type='issues' and v_action in ('opened','reopened','closed') then
    v_login:=case
      when v_action='opened' then coalesce(v_payload#>>'{issue,user,login}',v_payload#>>'{sender,login}')
      else coalesce(v_payload#>>'{sender,login}',v_payload#>>'{issue,user,login}')
    end;
    v_fallback:=v_login;
    v_avatar:=case
      when v_action='opened' then coalesce(v_payload#>>'{issue,user,avatar_url}',v_payload#>>'{sender,avatar_url}')
      else coalesce(v_payload#>>'{sender,avatar_url}',v_payload#>>'{issue,user,avatar_url}')
    end;
    select a.user_id,a.label,a.avatar_url into v_actor,v_label,v_profile_avatar from private.github_actor(v_login,v_fallback,v_avatar) a;
    v_number:=coalesce(v_payload#>>'{issue,number}',v_payload->>'number','?');
    v_title:=v_label||case v_action when 'opened' then ' abriu Issue #' when 'reopened' then ' reabriu Issue #' else ' fechou Issue #' end||v_number;
    v_summary:=coalesce(v_payload#>>'{issue,title}','Issue');
    v_status:=coalesce(v_payload#>>'{issue,state}',v_action);
    v_url:=v_payload#>>'{issue,html_url}';
    v_key:=coalesce(p_event.delivery_id,p_event.id::text)||':issue';
  elsif p_event.event_type='pull_request_review' and v_action='submitted' then
    v_login:=coalesce(v_payload#>>'{review,user,login}',v_payload#>>'{sender,login}');
    v_fallback:=coalesce(v_payload#>>'{review,user,login}',v_login,'GitHub');
    v_avatar:=coalesce(v_payload#>>'{review,user,avatar_url}',v_payload#>>'{sender,avatar_url}');
    select a.user_id,a.label,a.avatar_url into v_actor,v_label,v_profile_avatar from private.github_actor(v_login,v_fallback,v_avatar) a;
    v_number:=coalesce(v_payload#>>'{pull_request,number}',v_payload->>'number','?');
    v_title:=v_label||' revisou PR #'||v_number;
    v_status:=lower(coalesce(v_payload#>>'{review,state}','commented'));
    v_summary:=case v_status when 'approved' then 'Review aprovada' when 'changes_requested' then 'Alterações solicitadas' else coalesce(nullif(v_payload#>>'{review,body}',''),'Review enviada') end;
    v_url:=coalesce(v_payload#>>'{review,html_url}',v_payload#>>'{pull_request,html_url}');
    v_key:=coalesce(p_event.delivery_id,p_event.id::text)||':review';
  elsif p_event.event_type='release' and v_action in ('published','released','created') then
    v_login:=coalesce(v_payload#>>'{release,author,login}',v_payload#>>'{sender,login}');
    v_fallback:=coalesce(v_payload#>>'{release,author,login}',v_login,'GitHub');
    v_avatar:=coalesce(v_payload#>>'{release,author,avatar_url}',v_payload#>>'{sender,avatar_url}');
    select a.user_id,a.label,a.avatar_url into v_actor,v_label,v_profile_avatar from private.github_actor(v_login,v_fallback,v_avatar) a;
    v_title:=v_label||' publicou release '||coalesce(v_payload#>>'{release,tag_name}','');
    v_summary:=coalesce(nullif(v_payload#>>'{release,name}',''),'Nova release publicada');
    v_status:='published';
    v_url:=v_payload#>>'{release,html_url}';
    v_key:=coalesce(p_event.delivery_id,p_event.id::text)||':release';
  elsif p_event.event_type='workflow_run' and v_action='completed' then
    v_actor:=null;v_label:='GitHub Actions';v_profile_avatar:=null;
    v_number:=coalesce(v_payload#>>'{workflow_run,run_number}','?');
    v_status:=coalesce(v_payload#>>'{workflow_run,conclusion}','completed');
    v_title:=coalesce(v_payload#>>'{workflow_run,name}','Workflow')||' #'||v_number||
      case v_status when 'success' then ' ✓' when 'failure' then ' ✕' when 'cancelled' then ' —' else '' end;
    v_summary:=case v_status when 'success' then 'Build concluído com sucesso' when 'failure' then 'Build falhou' when 'cancelled' then 'Build cancelado' else 'Workflow concluído' end;
    v_url:=v_payload#>>'{workflow_run,html_url}';
    v_key:=coalesce(p_event.delivery_id,p_event.id::text)||':workflow';
  else
    return;
  end if;

  insert into public.project_activity_feed(
    project_id,source,event_type,event_key,actor_user_id,actor_label,actor_avatar_url,title,summary,status,target_url,metadata,occurred_at
  ) values(
    p_event.project_id,'github',p_event.event_type,v_key,v_actor,coalesce(v_label,'GitHub'),v_profile_avatar,
    v_title,v_summary,coalesce(v_status,v_action),v_url,
    jsonb_build_object('repository',p_event.repository_full_name,'action',v_action),v_occurred
  ) on conflict(project_id,event_key) do update set
    actor_user_id=excluded.actor_user_id,actor_label=excluded.actor_label,actor_avatar_url=excluded.actor_avatar_url,
    title=excluded.title,summary=excluded.summary,status=excluded.status,target_url=excluded.target_url,
    metadata=excluded.metadata,occurred_at=excluded.occurred_at;
end;
$$;

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
  v_pr_opened integer := 0;
  v_pr_merged integer := 0;
  v_reviews integer := 0;
  v_issues integer := 0;
  v_issues_opened integer := 0;
  v_issues_closed integer := 0;
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
    count(*) filter(where event_type='pull_request' and metadata->>'action'='opened')::integer,
    count(*) filter(where event_type='pull_request' and status='merged')::integer,
    count(*) filter(where event_type='pull_request_review')::integer,
    count(*) filter(where event_type='issues')::integer,
    count(*) filter(where event_type='issues' and metadata->>'action'='opened')::integer,
    count(*) filter(where event_type='issues' and metadata->>'action'='closed')::integer,
    count(*) filter(where event_type='release')::integer,
    count(*) filter(where event_type='project_update')::integer,
    count(distinct project_id)::integer,
    count(distinct occurred_at::date) filter(where occurred_at>=now()-interval '90 days')::integer,
    count(distinct event_type)::integer,
    count(*) filter(where occurred_at>=now()-interval '30 days')::integer,
    count(*) filter(where occurred_at>=now()-interval '60 days' and occurred_at<now()-interval '30 days')::integer
  into
    v_total,v_commits,v_pr_events,v_pr_opened,v_pr_merged,v_reviews,v_issues,v_issues_opened,v_issues_closed,v_releases,v_updates,
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
    least(12, v_reviews*3)
    + least(8, v_updates*2)
    + least(5, v_issues_closed*2);

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
      'top_labels',(
        select coalesce(jsonb_agg(jsonb_build_object('name',x.label,'count',x.total) order by x.total desc,x.label),'[]'::jsonb)
        from (
          select label,count(*)::integer as total
          from public.project_kanban_cards k
          cross join lateral unnest(coalesce(k.labels,'{}'::text[])) label
          where k.assignee_id=p_user_id and k.completed_at is not null and nullif(trim(label),'') is not null
          group by label
          order by total desc,label
          limit 8
        ) x
      ),
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
      'pull_requests_opened',v_pr_opened,
      'merged_pull_requests',v_pr_merged,
      'reviews',v_reviews,
      'issues',v_issues,
      'issues_opened',v_issues_opened,
      'issues_closed',v_issues_closed,
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
      'collaboration','Reviews até 12 pontos, atualizações públicas até 8 e Issues encerradas até 5.',
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
