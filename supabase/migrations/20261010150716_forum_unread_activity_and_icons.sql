-- Personalized unread activity state for forum nodes + CreativeZone icon assignments.

create table if not exists public.forum_node_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  node_id uuid not null references public.categories(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, node_id)
);

alter table public.forum_node_reads enable row level security;

grant select, insert, update, delete on public.forum_node_reads to authenticated;

drop policy if exists "users read own forum node state" on public.forum_node_reads;
create policy "users read own forum node state"
on public.forum_node_reads
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "users insert own forum node state" on public.forum_node_reads;
create policy "users insert own forum node state"
on public.forum_node_reads
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "users update own forum node state" on public.forum_node_reads;
create policy "users update own forum node state"
on public.forum_node_reads
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "users delete own forum node state" on public.forum_node_reads;
create policy "users delete own forum node state"
on public.forum_node_reads
for delete
to authenticated
using (user_id = (select auth.uid()));

create index if not exists forum_node_reads_user_read_idx
  on public.forum_node_reads(user_id, last_read_at desc);

create or replace function public.mark_forum_node_read(p_node_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or p_node_id is null then
    return;
  end if;

  insert into public.forum_node_reads(user_id, node_id, last_read_at)
  with recursive lineage as (
    select c.id, c.parent_id
    from public.categories c
    where c.id = p_node_id

    union all

    select parent.id, parent.parent_id
    from public.categories parent
    join lineage child on child.parent_id = parent.id
  )
  select v_user_id, lineage.id, now()
  from lineage
  on conflict (user_id, node_id)
  do update set last_read_at = excluded.last_read_at;
end;
$function$;

revoke all on function public.mark_forum_node_read(uuid) from public;
grant execute on function public.mark_forum_node_read(uuid) to authenticated;

drop function if exists public.get_forum_node_summaries(uuid[]);

create function public.get_forum_node_summaries(p_node_ids uuid[])
returns table(
  node_id uuid,
  topic_count bigint,
  post_count bigint,
  last_topic_id uuid,
  last_topic_title text,
  last_activity_at timestamptz,
  last_actor_id uuid,
  last_actor_username text,
  last_actor_display_name text,
  last_actor_avatar_url text,
  has_unread boolean
)
language sql
stable
set search_path = ''
as $function$
  with recursive selected as (
    select unnest(coalesce(p_node_ids,'{}'::uuid[])) as node_id
  ),
  tree(root_id,node_id) as (
    select s.node_id,s.node_id from selected s
    union all
    select tree.root_id,c.id
    from tree
    join public.categories c on c.parent_id=tree.node_id
  ),
  topic_scope as (
    select
      tree.root_id,
      t.id as topic_id,
      t.title,
      t.author_id,
      t.created_at,
      t.updated_at
    from tree
    join public.topics t on t.category_id=tree.node_id
  ),
  counts as (
    select
      tree.root_id,
      count(distinct t.id)::bigint as topic_count,
      count(distinct po.id)::bigint as post_count
    from tree
    left join public.topics t on t.category_id=tree.node_id
    left join public.posts po on po.topic_id=t.id
    group by tree.root_id
  ),
  activity as (
    select
      ts.root_id,
      ts.topic_id,
      ts.title as topic_title,
      ts.author_id as actor_id,
      greatest(ts.created_at,ts.updated_at) as activity_at
    from topic_scope ts

    union all

    select
      ts.root_id,
      ts.topic_id,
      ts.title as topic_title,
      po.author_id as actor_id,
      po.created_at as activity_at
    from topic_scope ts
    join public.posts po on po.topic_id=ts.topic_id
  ),
  latest as (
    select distinct on (a.root_id)
      a.root_id,
      a.topic_id,
      a.topic_title,
      a.actor_id,
      a.activity_at
    from activity a
    order by a.root_id,a.activity_at desc,a.topic_id
  )
  select
    s.node_id,
    coalesce(c.topic_count,0)::bigint,
    coalesce(c.post_count,0)::bigint,
    l.topic_id,
    l.topic_title,
    l.activity_at,
    l.actor_id,
    p.username,
    p.display_name,
    p.avatar_url,
    case
      when auth.uid() is null or l.activity_at is null then false
      when r.last_read_at is null then true
      else l.activity_at > r.last_read_at
    end as has_unread
  from selected s
  left join counts c on c.root_id=s.node_id
  left join latest l on l.root_id=s.node_id
  left join public.profiles p on p.id=l.actor_id
  left join public.forum_node_reads r
    on r.user_id=auth.uid()
   and r.node_id=s.node_id;
$function$;

grant execute on function public.get_forum_node_summaries(uuid[]) to anon, authenticated;

update public.categories set icon='tabler:building-community' where slug='creativezone';
update public.categories set icon='tabler:users-group' where slug='central-da-comunidade';
update public.categories set icon='tabler:speakerphone' where slug='regras-e-comunicados';
update public.categories set icon='tabler:flask-2' where slug='laboratorio-do-forum';
update public.categories set icon='tabler:cpu-2' where slug='tecnologias-integracoes';
update public.categories set icon='tabler:palette' where slug='creative-design';
update public.categories set icon='tabler:cloud-download' where slug='downloads';
update public.categories set icon='simple-icons:adobe' where slug='adobe';
