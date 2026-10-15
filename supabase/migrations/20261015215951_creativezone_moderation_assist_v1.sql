create table if not exists public.moderation_assessments (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('topic','post','chat_message')),
  target_id uuid not null,
  author_id uuid references public.profiles(id) on delete set null,
  content_hash text not null,
  analyzer_version text not null default 'creativezone-local-v1',
  provider text not null default 'creativezone-local',
  risk_score integer not null default 0 check (risk_score between 0 and 100),
  recommendation text not null default 'allow' check (recommendation in ('allow','review','urgent')),
  categories jsonb not null default '{}'::jsonb,
  signals jsonb not null default '{}'::jsonb,
  provider_result jsonb not null default '{}'::jsonb,
  review_status text not null default 'pending' check (review_status in ('pending','reviewed','dismissed')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_note text not null default '' check (char_length(review_note) <= 2000),
  reviewed_at timestamptz,
  analyzed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(target_type,target_id)
);

create index if not exists moderation_assessments_queue_idx
  on public.moderation_assessments(review_status,recommendation,risk_score desc,analyzed_at desc);
create index if not exists moderation_assessments_author_idx
  on public.moderation_assessments(author_id,analyzed_at desc);
create index if not exists moderation_assessments_target_idx
  on public.moderation_assessments(target_type,target_id);

alter table public.moderation_assessments enable row level security;
revoke all on table public.moderation_assessments from anon, authenticated;
grant all on table public.moderation_assessments to service_role;

drop policy if exists "staff read moderation assessments" on public.moderation_assessments;
create policy "staff read moderation assessments"
on public.moderation_assessments for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id=(select auth.uid()) and p.role in ('moderator','admin')
));

create table if not exists public.moderation_analysis_queue (
  target_type text not null check (target_type in ('topic','post','chat_message')),
  target_id uuid not null,
  content_hash text not null,
  status text not null default 'pending' check (status in ('pending','processing','done','error')),
  priority integer not null default 0,
  attempts integer not null default 0,
  last_error text not null default '' check (char_length(last_error) <= 1000),
  queued_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(target_type,target_id)
);

create index if not exists moderation_analysis_queue_status_idx
  on public.moderation_analysis_queue(status,priority desc,queued_at asc);

alter table public.moderation_analysis_queue enable row level security;
revoke all on table public.moderation_analysis_queue from anon, authenticated;
grant all on table public.moderation_analysis_queue to service_role;

drop policy if exists "moderation queue edge only" on public.moderation_analysis_queue;
create policy "moderation queue edge only"
on public.moderation_analysis_queue for all to anon, authenticated using(false) with check(false);

create or replace function public.review_moderation_assessment(
  p_assessment_id uuid,
  p_status text,
  p_note text default ''
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_item public.moderation_assessments%rowtype;
begin
  select role into v_role from public.profiles where id=v_user;
  if v_user is null or v_role not in ('moderator','admin') then raise exception 'Staff access required'; end if;
  if p_status not in ('reviewed','dismissed') then raise exception 'Invalid assessment status'; end if;
  if char_length(coalesce(p_note,'')) > 2000 then raise exception 'Review note too long'; end if;

  select * into v_item from public.moderation_assessments where id=p_assessment_id for update;
  if not found then raise exception 'Assessment not found'; end if;

  update public.moderation_assessments
  set review_status=p_status, reviewed_by=v_user, review_note=coalesce(p_note,''),
      reviewed_at=now(), updated_at=now()
  where id=p_assessment_id;

  insert into public.moderation_actions(moderator_id,action_type,target_type,target_id,reason,metadata)
  values(v_user,'assessment_'||p_status,v_item.target_type,v_item.target_id,coalesce(p_note,''),
    jsonb_build_object('assessment_id',v_item.id,'risk_score',v_item.risk_score,
      'recommendation',v_item.recommendation,'analyzer_version',v_item.analyzer_version));
end;
$$;

revoke all on function public.review_moderation_assessment(uuid,text,text) from public,anon;
grant execute on function public.review_moderation_assessment(uuid,text,text) to authenticated;

create or replace function public.enqueue_topic_moderation()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_hash text;
begin
  v_hash := md5(coalesce(new.title,'') || E'\n' || coalesce(new.content,''));
  insert into public.moderation_analysis_queue(target_type,target_id,content_hash,status,priority,attempts,last_error,queued_at,updated_at)
  values('topic',new.id,v_hash,'pending',10,0,'',now(),now())
  on conflict(target_type,target_id) do update
  set content_hash=excluded.content_hash,status='pending',
      priority=greatest(public.moderation_analysis_queue.priority,excluded.priority),
      attempts=0,last_error='',queued_at=now(),updated_at=now();
  return new;
end;
$$;

create or replace function public.enqueue_post_moderation()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_hash text;
begin
  v_hash := md5(coalesce(new.content,''));
  insert into public.moderation_analysis_queue(target_type,target_id,content_hash,status,priority,attempts,last_error,queued_at,updated_at)
  values('post',new.id,v_hash,'pending',8,0,'',now(),now())
  on conflict(target_type,target_id) do update
  set content_hash=excluded.content_hash,status='pending',
      priority=greatest(public.moderation_analysis_queue.priority,excluded.priority),
      attempts=0,last_error='',queued_at=now(),updated_at=now();
  return new;
end;
$$;

create or replace function public.enqueue_chat_moderation()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_hash text;
begin
  if new.deleted_at is not null then return new; end if;
  v_hash := md5(coalesce(new.content,''));
  insert into public.moderation_analysis_queue(target_type,target_id,content_hash,status,priority,attempts,last_error,queued_at,updated_at)
  values('chat_message',new.id,v_hash,'pending',12,0,'',now(),now())
  on conflict(target_type,target_id) do update
  set content_hash=excluded.content_hash,status='pending',
      priority=greatest(public.moderation_analysis_queue.priority,excluded.priority),
      attempts=0,last_error='',queued_at=now(),updated_at=now();
  return new;
end;
$$;

drop trigger if exists topics_enqueue_moderation on public.topics;
create trigger topics_enqueue_moderation after insert or update of title,content on public.topics
for each row execute function public.enqueue_topic_moderation();

drop trigger if exists posts_enqueue_moderation on public.posts;
create trigger posts_enqueue_moderation after insert or update of content on public.posts
for each row execute function public.enqueue_post_moderation();

drop trigger if exists chat_enqueue_moderation on public.chat_messages;
create trigger chat_enqueue_moderation after insert or update of content on public.chat_messages
for each row execute function public.enqueue_chat_moderation();

insert into public.moderation_analysis_queue(target_type,target_id,content_hash,status,priority)
select 'topic',id,md5(coalesce(title,'') || E'\n' || coalesce(content,'')),'pending',5
from public.topics order by updated_at desc limit 50
on conflict(target_type,target_id) do nothing;

insert into public.moderation_analysis_queue(target_type,target_id,content_hash,status,priority)
select 'post',id,md5(coalesce(content,'')),'pending',4
from public.posts order by updated_at desc limit 100
on conflict(target_type,target_id) do nothing;

insert into public.moderation_analysis_queue(target_type,target_id,content_hash,status,priority)
select 'chat_message',id,md5(coalesce(content,'')),'pending',6
from public.chat_messages where deleted_at is null order by updated_at desc limit 100
on conflict(target_type,target_id) do nothing;
