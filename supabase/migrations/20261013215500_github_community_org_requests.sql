create table public.github_org_membership_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization text not null default 'Creatiive-Zone',
  github_username text not null,
  message text not null default '',
  status text not null default 'pending' check (status in ('pending','invited','declined','cancelled')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index github_org_membership_requests_one_pending
on public.github_org_membership_requests(user_id, organization)
where status = 'pending';

create index github_org_membership_requests_status_created_idx
on public.github_org_membership_requests(status, created_at desc);

alter table public.github_org_membership_requests enable row level security;

create policy "github org requests own read"
on public.github_org_membership_requests
for select
to authenticated
using (user_id = auth.uid());

create policy "github org requests staff read"
on public.github_org_membership_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (p.system_owner = true or p.role in ('admin','moderator'))
  )
);

create or replace function private.queue_email_notification()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_enabled boolean := false;
  v_email text;
  v_watch_email boolean := true;
  v_topic_id uuid;
begin
  if new.type = 'topic_watch' and nullif(new.data->>'topic_id','') is not null then
    begin
      v_topic_id := (new.data->>'topic_id')::uuid;
    exception when others then
      v_topic_id := null;
    end;

    if v_topic_id is not null then
      select w.email_notifications
      into v_watch_email
      from public.topic_watches w
      where w.topic_id = v_topic_id
        and w.user_id = new.user_id
      limit 1;

      if not coalesce(v_watch_email,false) then
        return new;
      end if;
    end if;
  end if;

  if new.type = 'github_org_join_request' then
    v_enabled := true;
  else
    select case new.type
      when 'new_reply' then s.email_reply
      when 'topic_watch' then s.email_watch
      when 'mention' then s.email_mention
      when 'chat_mention' then s.email_mention
      when 'quote' then s.email_quote
      when 'reaction' then s.email_reaction
      when 'new_follower' then s.email_follower
      when 'direct_message' then s.email_dm
      when 'moderation' then s.email_moderation
      when 'membership_granted' then s.email_membership
      when 'membership_expiring' then s.email_membership
      when 'membership_expired' then s.email_membership
      else false
    end
    into v_enabled
    from public.account_settings s
    where s.user_id = new.user_id;
  end if;

  if not coalesce(v_enabled,false) then return new; end if;

  select email into v_email from auth.users where id = new.user_id;
  if v_email is null then return new; end if;

  insert into private.notification_email_queue(
    notification_id,user_id,recipient_email,notification_type,payload
  ) values(new.id,new.user_id,v_email,new.type,new.data)
  on conflict(notification_id) do nothing;

  return new;
end;
$function$;

update public.membership_plans
set description = case id
  when 'free' then 'Comunidade completa + GitHub DevHub essencial.'
  when 'pro' then 'Mais segurança, inteligência e colaboração para seus projetos.'
  when 'elite' then 'Automação contínua, repositórios privados e Project Studio.'
  else description
end,
updated_at = now()
where id in ('free','pro','elite');
