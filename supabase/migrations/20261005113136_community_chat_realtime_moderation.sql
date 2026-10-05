
create table if not exists public.chat_messages (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) <= 500),
  reply_to uuid references public.chat_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

create index if not exists chat_messages_created_at_idx
  on public.chat_messages(created_at desc);
create index if not exists chat_messages_user_created_idx
  on public.chat_messages(user_id,created_at desc);
create index if not exists chat_messages_reply_to_idx
  on public.chat_messages(reply_to)
  where reply_to is not null;

alter table public.chat_messages enable row level security;

drop policy if exists "chat messages public read" on public.chat_messages;
create policy "chat messages public read"
on public.chat_messages for select
to anon, authenticated
using (true);

revoke all on table public.chat_messages from anon,authenticated;
grant select on table public.chat_messages to anon,authenticated;

create table if not exists public.chat_mutes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  muted_until timestamptz not null,
  reason text not null default '' check (char_length(reason) <= 1000),
  moderator_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_mutes_until_idx on public.chat_mutes(muted_until);

alter table public.chat_mutes enable row level security;

drop policy if exists "users and staff read chat mutes" on public.chat_mutes;
create policy "users and staff read chat mutes"
on public.chat_mutes for select
to authenticated
using (
  user_id=(select auth.uid())
  or exists(
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role in ('moderator','admin')
  )
);

revoke all on table public.chat_mutes from anon,authenticated;
grant select on table public.chat_mutes to authenticated;

create table if not exists public.chat_bans (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  banned_until timestamptz,
  reason text not null default '' check (char_length(reason) <= 1000),
  moderator_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_bans_until_idx on public.chat_bans(banned_until);

alter table public.chat_bans enable row level security;

drop policy if exists "users and staff read chat bans" on public.chat_bans;
create policy "users and staff read chat bans"
on public.chat_bans for select
to authenticated
using (
  user_id=(select auth.uid())
  or exists(
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role in ('moderator','admin')
  )
);

revoke all on table public.chat_bans from anon,authenticated;
grant select on table public.chat_bans to authenticated;

create or replace function private.clean_chat_content(p_content text)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  v_content text := btrim(coalesce(p_content,''));
begin
  if char_length(v_content) < 1 then
    raise exception 'A mensagem não pode ficar vazia.';
  end if;

  if char_length(v_content) > 500 then
    raise exception 'A mensagem deve ter no máximo 500 caracteres.';
  end if;

  if v_content ~* '(javascript:|vbscript:|data:text/html|file://)' then
    raise exception 'A mensagem contém um link ou protocolo não permitido.';
  end if;

  if regexp_count(v_content,'https?://',1,'i') > 2 then
    raise exception 'Use no máximo 2 links por mensagem.';
  end if;

  return v_content;
end;
$$;

revoke all on function private.clean_chat_content(text) from public,anon,authenticated;

create or replace function public.send_chat_message(
  p_content text,
  p_reply_to uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_content text;
  v_id uuid;
  v_status text;
  v_muted_until timestamptz;
  v_banned_until timestamptz;
  v_permanent_ban boolean := false;
  v_latest timestamptz;
  v_burst integer;
begin
  if v_user is null then
    raise exception 'Entre na sua conta para conversar no chat.';
  end if;

  select account_status into v_status
  from public.profiles
  where id=v_user;

  if v_status is distinct from 'active' then
    raise exception 'Sua conta não está ativa para usar o chat.';
  end if;

  select muted_until into v_muted_until
  from public.chat_mutes
  where user_id=v_user
    and muted_until > now();

  if v_muted_until is not null then
    raise exception 'Você está silenciado no chat até %.', to_char(v_muted_until at time zone 'UTC','YYYY-MM-DD HH24:MI UTC');
  end if;

  select banned_until, (banned_until is null)
    into v_banned_until, v_permanent_ban
  from public.chat_bans
  where user_id=v_user
    and (banned_until is null or banned_until > now());

  if found then
    if v_permanent_ban then
      raise exception 'Seu acesso ao Chat da Comunidade foi bloqueado pela moderação.';
    end if;
    raise exception 'Seu acesso ao chat está bloqueado temporariamente.';
  end if;

  v_content := private.clean_chat_content(p_content);

  if p_reply_to is not null and not exists(
    select 1
    from public.chat_messages
    where id=p_reply_to and deleted_at is null
  ) then
    raise exception 'A mensagem respondida não está mais disponível.';
  end if;

  select created_at into v_latest
  from public.chat_messages
  where user_id=v_user
  order by created_at desc
  limit 1;

  if v_latest is not null and v_latest > now() - interval '2 seconds' then
    raise exception 'Aguarde 2 segundos antes de enviar outra mensagem.';
  end if;

  select count(*) into v_burst
  from public.chat_messages
  where user_id=v_user
    and created_at > now() - interval '15 seconds';

  if v_burst >= 5 then
    raise exception 'Muitas mensagens em pouco tempo. Aguarde alguns segundos.';
  end if;

  if exists(
    select 1
    from public.chat_messages
    where user_id=v_user
      and deleted_at is null
      and lower(content)=lower(v_content)
      and created_at > now() - interval '60 seconds'
  ) then
    raise exception 'Evite repetir a mesma mensagem em sequência.';
  end if;

  insert into public.chat_messages(user_id,content,reply_to)
  values(v_user,v_content,p_reply_to)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.send_chat_message(text,uuid) from public,anon;
grant execute on function public.send_chat_message(text,uuid) to authenticated;

create or replace function public.edit_chat_message(
  p_message_id uuid,
  p_content text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_content text;
  v_message public.chat_messages%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_message
  from public.chat_messages
  where id=p_message_id
  for update;

  if not found then raise exception 'Mensagem não encontrada.'; end if;
  if v_message.deleted_at is not null then raise exception 'Esta mensagem já foi removida.'; end if;
  if v_message.user_id <> v_user then raise exception 'Você só pode editar suas próprias mensagens.'; end if;
  if v_message.created_at < now() - interval '10 minutes' then
    raise exception 'Mensagens podem ser editadas por até 10 minutos.';
  end if;

  v_content := private.clean_chat_content(p_content);

  update public.chat_messages
  set content=v_content,
      edited_at=now(),
      updated_at=now()
  where id=p_message_id;
end;
$$;

revoke all on function public.edit_chat_message(uuid,text) from public,anon;
grant execute on function public.edit_chat_message(uuid,text) to authenticated;

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

  update public.chat_messages
  set content='',
      deleted_at=coalesce(deleted_at,now()),
      deleted_by=v_user,
      updated_at=now()
  where id=p_message_id;
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
    update public.chat_messages
    set content='',
        deleted_at=coalesce(deleted_at,now()),
        deleted_by=v_user,
        updated_at=now()
    where id=p_message_id;

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
        moderator_id=excluded.moderator_id,
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

alter table public.reports
  drop constraint if exists reports_target_type_check;

alter table public.reports
  add constraint reports_target_type_check
  check (target_type in ('topic','post','profile','project','chat_message'));

create or replace function public.create_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_details text default ''
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_exists boolean := false;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_target_type not in ('topic','post','profile','project','chat_message') then
    raise exception 'Invalid report target';
  end if;
  if p_reason not in ('spam','abuse','harassment','misinformation','illegal','privacy','other') then
    raise exception 'Invalid report reason';
  end if;
  if char_length(coalesce(p_details,'')) > 2000 then
    raise exception 'Report details too long';
  end if;

  if p_target_type='topic' then
    select exists(select 1 from public.topics where id=p_target_id) into v_exists;
  elsif p_target_type='post' then
    select exists(select 1 from public.posts where id=p_target_id) into v_exists;
  elsif p_target_type='profile' then
    select exists(select 1 from public.profiles where id=p_target_id) into v_exists;
  elsif p_target_type='project' then
    select exists(select 1 from public.projects where id=p_target_id) into v_exists;
  elsif p_target_type='chat_message' then
    select exists(select 1 from public.chat_messages where id=p_target_id) into v_exists;
  end if;

  if not v_exists then raise exception 'Report target not found'; end if;

  insert into public.reports(reporter_id,target_type,target_id,reason,details)
  values(v_user,p_target_type,p_target_id,p_reason,coalesce(p_details,''))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_report(text,uuid,text,text) from public,anon;
grant execute on function public.create_report(text,uuid,text,text) to authenticated;

create or replace function private.notify_chat_mentions()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_username text;
  v_target uuid;
begin
  if new.deleted_at is not null then return new; end if;

  for v_username in
    select distinct match[1]
    from regexp_matches(new.content,'@([A-Za-z0-9_.-]{3,50})','g') as match
  loop
    select id into v_target
    from public.profiles
    where lower(username)=lower(v_username)
      and account_status='active'
    limit 1;

    if v_target is not null and v_target <> new.user_id then
      insert into public.notifications(user_id,actor_id,type,data)
      values(
        v_target,
        new.user_id,
        'chat_mention',
        jsonb_build_object(
          'chat_message_id',new.id,
          'path','/'
        )
      );
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function private.notify_chat_mentions() from public,anon,authenticated;

drop trigger if exists notify_chat_mentions on public.chat_messages;
create trigger notify_chat_mentions
after insert on public.chat_messages
for each row execute function private.notify_chat_mentions();

create or replace function private.cleanup_chat_messages()
returns void
language sql
security definer
set search_path=''
as $$
  delete from public.chat_messages
  where created_at < now() - interval '30 days';
$$;

revoke all on function private.cleanup_chat_messages() from public,anon,authenticated;

do $$
begin
  if not exists(
    select 1 from cron.job where jobname='creativezone-chat-retention'
  ) then
    perform cron.schedule(
      'creativezone-chat-retention',
      '17 4 * * *',
      'select private.cleanup_chat_messages();'
    );
  end if;
end $$;

do $$
begin
  if not exists(
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;
