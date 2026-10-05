create or replace function public.get_forum_node_summaries(p_node_ids uuid[])
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
  last_actor_avatar_url text
)
language sql
stable
set search_path=''
as $$
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
    p.avatar_url
  from selected s
  left join counts c on c.root_id=s.node_id
  left join latest l on l.root_id=s.node_id
  left join public.profiles p on p.id=l.actor_id;
$$;

revoke all on function public.get_forum_node_summaries(uuid[]) from public;
grant execute on function public.get_forum_node_summaries(uuid[]) to anon,authenticated;
