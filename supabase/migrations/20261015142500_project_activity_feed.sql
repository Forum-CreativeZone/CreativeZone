create table if not exists public.project_activity_feed (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source text not null check (source in ('github','security','creativezone')),
  event_type text not null,
  event_key text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_label text not null default '',
  actor_avatar_url text,
  title text not null,
  summary text not null default '',
  status text,
  target_url text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(project_id,event_key)
);

create index if not exists project_activity_feed_project_time_idx
  on public.project_activity_feed(project_id,occurred_at desc);

alter table public.project_activity_feed enable row level security;

create or replace function private.current_user_can_read_project_activity(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    exists(
      select 1
      from public.projects p
      where p.id=p_project_id
        and (
          exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.system_owner=true)
          or p.owner_id=(select auth.uid())
          or exists(
            select 1 from public.project_members pm
            where pm.project_id=p.id
              and pm.user_id=(select auth.uid())
              and pm.status='active'
          )
          or (
            p.visibility='public'
            and not exists(
              select 1 from public.github_devhub_repositories gr
              where gr.project_id=p.id and gr.status='active' and gr.private=true
            )
            and not exists(
              select 1 from public.project_repositories pr
              where pr.project_id=p.id and pr.is_private=true
            )
          )
        )
    ),
    false
  )
$$;

revoke all on function private.current_user_can_read_project_activity(uuid) from public;
grant execute on function private.current_user_can_read_project_activity(uuid) to anon,authenticated;

drop policy if exists "project activity readable" on public.project_activity_feed;
create policy "project activity readable"
on public.project_activity_feed for select
to anon,authenticated
using ((select private.current_user_can_read_project_activity(project_id)));

revoke insert,update,delete on public.project_activity_feed from anon,authenticated;
grant select on public.project_activity_feed to anon,authenticated;

create or replace function private.github_actor(p_login text,p_fallback text,p_avatar text)
returns table(user_id uuid,label text,avatar_url text)
language plpgsql
security definer
set search_path=''
as $$
begin
  return query
  select c.user_id,
         coalesce(nullif(p.display_name,''),nullif(p.username,''),nullif(p_fallback,''),nullif(p_login,''),'GitHub'),
         coalesce(nullif(p.avatar_url,''),nullif(p_avatar,''))
  from public.github_connections c
  left join public.profiles p on p.id=c.user_id
  where lower(c.github_username)=lower(coalesce(p_login,''))
  limit 1;

  if not found then
    return query select null::uuid,coalesce(nullif(p_fallback,''),nullif(p_login,''),'GitHub'),nullif(p_avatar,'');
  end if;
end;
$$;

revoke all on function private.github_actor(text,text,text) from public;

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
    v_login:=coalesce(v_payload#>>'{issue,user,login}',v_payload#>>'{sender,login}');
    v_fallback:=coalesce(v_payload#>>'{issue,user,login}',v_login,'GitHub');
    v_avatar:=coalesce(v_payload#>>'{issue,user,avatar_url}',v_payload#>>'{sender,avatar_url}');
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

create or replace function private.project_github_event_activity_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.sync_project_github_event_activity(new);
  return new;
end;
$$;

drop trigger if exists project_github_event_activity on public.project_github_events;
create trigger project_github_event_activity
after insert on public.project_github_events
for each row execute function private.project_github_event_activity_trigger();

create or replace function private.project_security_activity_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_summary text;
  v_status text;
begin
  if new.status not in ('completed','failed') then return new; end if;
  v_status:=case when new.status='failed' then 'failure' when coalesce(new.vulnerability_count,0)=0 then 'success' else 'warning' end;
  v_summary:=case
    when new.status='failed' then 'Auditoria de segurança falhou'
    when coalesce(new.vulnerability_count,0)=0 then '0 vulnerabilidades'
    else new.vulnerability_count||' vulnerabilidade(s) · score '||coalesce(new.security_score,0)||'/100'
  end;

  insert into public.project_activity_feed(
    project_id,source,event_type,event_key,actor_label,title,summary,status,metadata,occurred_at
  ) values(
    new.project_id,'security','security_scan','security:'||new.id,'CreativeZone Security',
    'CreativeZone Security',v_summary,v_status,
    jsonb_build_object(
      'security_score',new.security_score,'vulnerability_count',new.vulnerability_count,
      'critical_count',new.critical_count,'high_count',new.high_count,
      'trigger_type',new.trigger_type,'commit_sha',new.commit_sha
    ),
    coalesce(new.completed_at,new.started_at,now())
  ) on conflict(project_id,event_key) do update set
    summary=excluded.summary,status=excluded.status,metadata=excluded.metadata,occurred_at=excluded.occurred_at;
  return new;
end;
$$;

drop trigger if exists project_security_activity on public.project_security_audits;
create trigger project_security_activity
after insert or update of status,vulnerability_count,security_score,completed_at
on public.project_security_audits
for each row execute function private.project_security_activity_trigger();

create or replace function private.project_update_activity_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_label text;
  v_avatar text;
begin
  select coalesce(nullif(p.display_name,''),nullif(p.username,''),'Membro'),p.avatar_url
    into v_label,v_avatar
  from public.profiles p where p.id=new.author_id;

  insert into public.project_activity_feed(
    project_id,source,event_type,event_key,actor_user_id,actor_label,actor_avatar_url,title,summary,status,occurred_at
  ) values(
    new.project_id,'creativezone','project_update','update:'||new.id,new.author_id,coalesce(v_label,'Membro'),v_avatar,
    coalesce(v_label,'Membro')||' publicou uma atualização',new.content,'published',new.created_at
  ) on conflict(project_id,event_key) do nothing;
  return new;
end;
$$;

drop trigger if exists project_update_activity on public.project_updates;
create trigger project_update_activity
after insert on public.project_updates
for each row execute function private.project_update_activity_trigger();

do $$
begin
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='project_activity_feed'
  ) then
    alter publication supabase_realtime add table public.project_activity_feed;
  end if;
end $$;

-- Backfill recent real activity.
select private.sync_project_github_event_activity(e)
from public.project_github_events e
where e.project_id is not null
  and e.received_at >= now()-interval '30 days'
  and e.event_type in ('push','pull_request','issues','pull_request_review','release','workflow_run');

insert into public.project_activity_feed(
  project_id,source,event_type,event_key,actor_label,title,summary,status,metadata,occurred_at
)
select a.project_id,'security','security_scan','security:'||a.id,'CreativeZone Security','CreativeZone Security',
       case when a.status='failed' then 'Auditoria de segurança falhou'
            when coalesce(a.vulnerability_count,0)=0 then '0 vulnerabilidades'
            else a.vulnerability_count||' vulnerabilidade(s) · score '||coalesce(a.security_score,0)||'/100' end,
       case when a.status='failed' then 'failure' when coalesce(a.vulnerability_count,0)=0 then 'success' else 'warning' end,
       jsonb_build_object('security_score',a.security_score,'vulnerability_count',a.vulnerability_count,'critical_count',a.critical_count,'high_count',a.high_count,'trigger_type',a.trigger_type,'commit_sha',a.commit_sha),
       coalesce(a.completed_at,a.started_at,now())
from public.project_security_audits a
where a.status in ('completed','failed')
  and coalesce(a.completed_at,a.started_at)>=now()-interval '30 days'
on conflict(project_id,event_key) do update set summary=excluded.summary,status=excluded.status,metadata=excluded.metadata,occurred_at=excluded.occurred_at;

insert into public.project_activity_feed(
  project_id,source,event_type,event_key,actor_user_id,actor_label,actor_avatar_url,title,summary,status,occurred_at
)
select u.project_id,'creativezone','project_update','update:'||u.id,u.author_id,
       coalesce(nullif(p.display_name,''),nullif(p.username,''),'Membro'),p.avatar_url,
       coalesce(nullif(p.display_name,''),nullif(p.username,''),'Membro')||' publicou uma atualização',
       u.content,'published',u.created_at
from public.project_updates u
left join public.profiles p on p.id=u.author_id
where u.created_at>=now()-interval '30 days'
on conflict(project_id,event_key) do nothing;
