-- Polls, RageZone-style topic state metadata, and trace-free chat deletion.

create table if not exists public.topic_polls (
  topic_id uuid primary key references public.topics(id) on delete cascade,
  question text not null check (char_length(question) between 3 and 280),
  allow_multiple boolean not null default false,
  closes_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.topic_poll_options (
  id uuid primary key default extensions.uuid_generate_v4(),
  topic_id uuid not null references public.topic_polls(topic_id) on delete cascade,
  label text not null check (char_length(label) between 1 and 180),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists topic_poll_options_topic_order_idx
  on public.topic_poll_options(topic_id,sort_order,id);

create table if not exists public.topic_poll_votes (
  topic_id uuid not null references public.topic_polls(topic_id) on delete cascade,
  option_id uuid not null references public.topic_poll_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(option_id,user_id)
);

create index if not exists topic_poll_votes_topic_user_idx
  on public.topic_poll_votes(topic_id,user_id);

alter table public.topic_polls enable row level security;
alter table public.topic_poll_options enable row level security;
alter table public.topic_poll_votes enable row level security;

drop policy if exists "polls public read" on public.topic_polls;
create policy "polls public read"
on public.topic_polls for select
to anon,authenticated
using (true);

drop policy if exists "poll options public read" on public.topic_poll_options;
create policy "poll options public read"
on public.topic_poll_options for select
to anon,authenticated
using (true);

revoke all on public.topic_polls from anon,authenticated;
revoke all on public.topic_poll_options from anon,authenticated;
revoke all on public.topic_poll_votes from anon,authenticated;
grant select on public.topic_polls,public.topic_poll_options to anon,authenticated;

create or replace function public.create_topic_poll(
  p_topic_id uuid,
  p_question text,
  p_options text[],
  p_allow_multiple boolean default false,
  p_closes_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_options text[];
  v_item text;
  v_index integer := 0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  if not exists(
    select 1 from public.topics t
    where t.id=p_topic_id and t.author_id=v_user
  ) and not exists(
    select 1 from public.profiles p
    where p.id=v_user and p.role in ('moderator','admin')
  ) then
    raise exception 'Você não pode configurar a enquete deste tópico.';
  end if;

  if char_length(btrim(coalesce(p_question,''))) not between 3 and 280 then
    raise exception 'A pergunta da enquete deve ter entre 3 e 280 caracteres.';
  end if;

  select array_agg(x order by ord)
  into v_options
  from (
    select distinct on (lower(btrim(value)))
      btrim(value) as x,
      ord
    from unnest(coalesce(p_options,'{}'::text[])) with ordinality as u(value,ord)
    where btrim(value) <> ''
      and char_length(btrim(value)) <= 180
    order by lower(btrim(value)),ord
  ) cleaned;

  if coalesce(array_length(v_options,1),0) < 2 or coalesce(array_length(v_options,1),0) > 10 then
    raise exception 'A enquete precisa ter entre 2 e 10 opções.';
  end if;

  if p_closes_at is not null and p_closes_at <= now() then
    raise exception 'A data de encerramento da enquete precisa estar no futuro.';
  end if;

  insert into public.topic_polls(topic_id,question,allow_multiple,closes_at,created_by,updated_at)
  values(
    p_topic_id,
    btrim(p_question),
    coalesce(p_allow_multiple,false),
    p_closes_at,
    v_user,
    now()
  )
  on conflict(topic_id) do update
  set question=excluded.question,
      allow_multiple=excluded.allow_multiple,
      closes_at=excluded.closes_at,
      updated_at=now();

  delete from public.topic_poll_options where topic_id=p_topic_id;

  foreach v_item in array v_options loop
    v_index := v_index + 1;
    insert into public.topic_poll_options(topic_id,label,sort_order)
    values(p_topic_id,v_item,v_index);
  end loop;
end;
$$;

revoke all on function public.create_topic_poll(uuid,text,text[],boolean,timestamptz) from public,anon;
grant execute on function public.create_topic_poll(uuid,text,text[],boolean,timestamptz) to authenticated;

create or replace function public.delete_topic_poll(p_topic_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  if not exists(
    select 1 from public.topics t
    where t.id=p_topic_id and t.author_id=v_user
  ) and not exists(
    select 1 from public.profiles p
    where p.id=v_user and p.role in ('moderator','admin')
  ) then
    raise exception 'Você não pode remover a enquete deste tópico.';
  end if;

  delete from public.topic_polls where topic_id=p_topic_id;
end;
$$;

revoke all on function public.delete_topic_poll(uuid) from public,anon;
grant execute on function public.delete_topic_poll(uuid) to authenticated;

create or replace function public.vote_topic_poll(
  p_topic_id uuid,
  p_option_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_poll public.topic_polls%rowtype;
  v_ids uuid[];
begin
  if v_user is null then raise exception 'Entre na sua conta para votar.'; end if;

  if not exists(
    select 1 from public.profiles p
    where p.id=v_user and p.account_status='active'
  ) then
    raise exception 'Sua conta não está ativa para votar.';
  end if;

  select * into v_poll
  from public.topic_polls
  where topic_id=p_topic_id;

  if not found then raise exception 'Enquete não encontrada.'; end if;
  if v_poll.closes_at is not null and v_poll.closes_at <= now() then
    raise exception 'Esta enquete já foi encerrada.';
  end if;

  select array_agg(distinct id)
  into v_ids
  from unnest(coalesce(p_option_ids,'{}'::uuid[])) as id;

  if coalesce(array_length(v_ids,1),0) < 1 then
    raise exception 'Escolha pelo menos uma opção.';
  end if;

  if not v_poll.allow_multiple and array_length(v_ids,1) > 1 then
    raise exception 'Esta enquete aceita apenas uma opção.';
  end if;

  if array_length(v_ids,1) > 10 then
    raise exception 'Muitas opções selecionadas.';
  end if;

  if exists(
    select 1
    from unnest(v_ids) chosen(id)
    where not exists(
      select 1 from public.topic_poll_options o
      where o.id=chosen.id and o.topic_id=p_topic_id
    )
  ) then
    raise exception 'Uma das opções escolhidas não pertence a esta enquete.';
  end if;

  delete from public.topic_poll_votes
  where topic_id=p_topic_id and user_id=v_user;

  insert into public.topic_poll_votes(topic_id,option_id,user_id)
  select p_topic_id,id,v_user
  from unnest(v_ids) as id;
end;
$$;

revoke all on function public.vote_topic_poll(uuid,uuid[]) from public,anon;
grant execute on function public.vote_topic_poll(uuid,uuid[]) to authenticated;

create or replace function public.get_topic_poll(p_topic_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select case when p.topic_id is null then null else
    jsonb_build_object(
      'topic_id',p.topic_id,
      'question',p.question,
      'allow_multiple',p.allow_multiple,
      'closes_at',p.closes_at,
      'closed',(p.closes_at is not null and p.closes_at <= now()),
      'total_voters',(
        select count(distinct v.user_id)
        from public.topic_poll_votes v
        where v.topic_id=p.topic_id
      ),
      'options',coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id',o.id,
            'label',o.label,
            'sort_order',o.sort_order,
            'vote_count',(
              select count(*) from public.topic_poll_votes v
              where v.option_id=o.id
            ),
            'selected',case
              when auth.uid() is null then false
              else exists(
                select 1 from public.topic_poll_votes v
                where v.option_id=o.id and v.user_id=auth.uid()
              )
            end
          )
          order by o.sort_order,o.id
        )
        from public.topic_poll_options o
        where o.topic_id=p.topic_id
      ),'[]'::jsonb)
    ) end
  from public.topic_polls p
  where p.topic_id=p_topic_id;
$$;

revoke all on function public.get_topic_poll(uuid) from public;
grant execute on function public.get_topic_poll(uuid) to anon,authenticated;

-- Return poll state directly in forum listings for icons/status.
drop function if exists public.get_forum_topics_page(text,uuid,text,integer,integer,uuid[]);

create function public.get_forum_topics_page(
  p_query text default null,
  p_category_id uuid default null,
  p_sort text default 'recent',
  p_limit integer default 10,
  p_offset integer default 0,
  p_ignored_ids uuid[] default '{}'::uuid[]
)
returns table(
  id uuid,
  category_id uuid,
  author_id uuid,
  title text,
  slug text,
  content text,
  views integer,
  pinned boolean,
  locked boolean,
  has_poll boolean,
  created_at timestamptz,
  updated_at timestamptz,
  category_name text,
  category_slug text,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  author_signature text,
  reply_count bigint,
  last_activity_at timestamptz,
  last_actor_id uuid,
  last_actor_username text,
  last_actor_display_name text,
  last_actor_avatar_url text,
  total_count bigint
)
language sql
stable
set search_path=''
as $$
  with recursive category_tree as (
    select c.id
    from public.categories c
    where p_category_id is not null and c.id=p_category_id

    union all

    select child.id
    from public.categories child
    join category_tree parent on child.parent_id=parent.id
  ),
  filtered as (
    select
      t.id,
      t.category_id,
      t.author_id,
      t.title,
      t.slug,
      t.content,
      t.views,
      t.pinned,
      t.locked,
      exists(select 1 from public.topic_polls poll where poll.topic_id=t.id) as has_poll,
      t.created_at,
      t.updated_at,
      c.name as category_name,
      c.slug as category_slug,
      p.username as author_username,
      p.display_name as author_display_name,
      p.avatar_url as author_avatar_url,
      p.signature as author_signature,
      (select count(*) from public.posts po where po.topic_id=t.id) as reply_count,
      latest.activity_at as last_activity_at,
      latest.actor_id as last_actor_id,
      last_actor.username as last_actor_username,
      last_actor.display_name as last_actor_display_name,
      last_actor.avatar_url as last_actor_avatar_url
    from public.topics t
    join public.categories c on c.id=t.category_id
    left join public.profiles p on p.id=t.author_id
    left join lateral (
      select activity.activity_at,activity.actor_id
      from (
        select t.created_at as activity_at,t.author_id as actor_id
        union all
        select po.created_at,po.author_id
        from public.posts po
        where po.topic_id=t.id
      ) activity
      order by activity.activity_at desc nulls last
      limit 1
    ) latest on true
    left join public.profiles last_actor on last_actor.id=latest.actor_id
    where (
      p_category_id is null
      or t.category_id in (select category_tree.id from category_tree)
    )
      and (t.author_id is null or not (t.author_id = any(coalesce(p_ignored_ids,'{}'::uuid[]))))
      and (
        nullif(btrim(coalesce(p_query,'')),'') is null
        or t.search_vector @@ websearch_to_tsquery('portuguese'::regconfig,p_query)
        or coalesce(p.display_name,'') ilike '%'||p_query||'%'
        or coalesce(p.username,'') ilike '%'||p_query||'%'
      )
  )
  select
    f.id,f.category_id,f.author_id,f.title,f.slug,f.content,f.views,f.pinned,f.locked,f.has_poll,
    f.created_at,f.updated_at,f.category_name,f.category_slug,f.author_username,
    f.author_display_name,f.author_avatar_url,f.author_signature,f.reply_count,
    f.last_activity_at,f.last_actor_id,f.last_actor_username,f.last_actor_display_name,
    f.last_actor_avatar_url,count(*) over() as total_count
  from filtered f
  order by
    f.pinned desc,
    case when p_sort='popular' then f.views end desc nulls last,
    f.last_activity_at desc nulls last,
    f.created_at desc
  limit greatest(1,least(coalesce(p_limit,10),50))
  offset greatest(coalesce(p_offset,0),0);
$$;

revoke all on function public.get_forum_topics_page(text,uuid,text,integer,integer,uuid[]) from public;
grant execute on function public.get_forum_topics_page(text,uuid,text,integer,integer,uuid[]) to anon,authenticated;

-- Chat deletion is permanent and leaves no tombstone in the public stream.
create or replace function public.delete_chat_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_author uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select role into v_role from public.profiles where id=v_user;
  select user_id into v_author from public.chat_messages where id=p_message_id;

  if v_author is null then raise exception 'Mensagem não encontrada.'; end if;

  if v_author <> v_user and v_role not in ('moderator','admin') then
    raise exception 'Você não pode remover esta mensagem.';
  end if;

  delete from public.chat_messages where id=p_message_id;
end;
$$;

revoke all on function public.delete_chat_message(uuid) from public,anon;
grant execute on function public.delete_chat_message(uuid) to authenticated;

create or replace function public.moderate_chat_message(
  p_message_id uuid,
  p_action text,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_target uuid;
  v_target_role text;
begin
  select role into v_role from public.profiles where id=v_user;
  if v_user is null or v_role not in ('moderator','admin') then
    raise exception 'Staff access required';
  end if;

  select m.user_id,p.role
    into v_target,v_target_role
  from public.chat_messages m
  join public.profiles p on p.id=m.user_id
  where m.id=p_message_id;

  if v_target is null then raise exception 'Mensagem não encontrada.'; end if;

  if v_target_role='admin' and v_role <> 'admin' then
    raise exception 'Somente administradores podem moderar outro administrador.';
  end if;

  if p_action='delete' then
    delete from public.chat_messages where id=p_message_id;

  elsif p_action in ('mute_10m','mute_1h','mute_24h') then
    insert into public.chat_mutes(user_id,muted_until,reason,moderator_id,updated_at)
    values(
      v_target,
      now() + case p_action
        when 'mute_10m' then interval '10 minutes'
        when 'mute_1h' then interval '1 hour'
        else interval '24 hours'
      end,
      left(coalesce(p_reason,''),1000),
      v_user,
      now()
    )
    on conflict(user_id) do update
    set muted_until=excluded.muted_until,
        reason=excluded.reason,
        moderator_id=excluded.moderator_id,
        updated_at=now();

  elsif p_action='unmute' then
    delete from public.chat_mutes where user_id=v_target;

  elsif p_action='ban' then
    insert into public.chat_bans(user_id,banned_until,reason,moderator_id,updated_at)
    values(v_target,null,left(coalesce(p_reason,''),1000),v_user,now())
    on conflict(user_id) do update
    set banned_until=null,
        reason=excluded.reason,
        moderator_id=v_user,
        updated_at=now();

  elsif p_action='unban' then
    delete from public.chat_bans where user_id=v_target;

  else
    raise exception 'Invalid moderation action';
  end if;

  insert into public.moderation_actions(
    moderator_id,action_type,target_type,target_id,reason
  )
  values(
    v_user,
    'chat_'||p_action,
    'chat_message',
    p_message_id,
    left(coalesce(p_reason,''),2000)
  );

  if p_action <> 'unmute' and p_action <> 'unban' then
    insert into public.notifications(user_id,actor_id,type,data)
    values(
      v_target,
      v_user,
      'moderation',
      jsonb_build_object(
        'message',
        case
          when p_action='delete' then 'Uma mensagem sua foi removida do Chat da Comunidade.'
          when p_action like 'mute_%' then 'Você foi silenciado temporariamente no Chat da Comunidade.'
          when p_action='ban' then 'Seu acesso ao Chat da Comunidade foi bloqueado.'
          else 'A moderação atualizou seu acesso ao Chat da Comunidade.'
        end,
        'path','/'
      )
    );
  end if;
end;
$$;

revoke all on function public.moderate_chat_message(uuid,text,text) from public,anon;
grant execute on function public.moderate_chat_message(uuid,text,text) to authenticated;

delete from public.chat_messages where deleted_at is not null;
