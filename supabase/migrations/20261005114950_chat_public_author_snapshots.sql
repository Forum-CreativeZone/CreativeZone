
alter table public.chat_messages
  add column if not exists author_username text,
  add column if not exists author_display_name text,
  add column if not exists author_avatar_url text,
  add column if not exists author_role text;

create or replace function private.fill_chat_author_snapshot()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  select
    p.username,
    p.display_name,
    p.avatar_url,
    p.role
  into
    new.author_username,
    new.author_display_name,
    new.author_avatar_url,
    new.author_role
  from public.profiles p
  where p.id=new.user_id;

  return new;
end;
$$;

revoke all on function private.fill_chat_author_snapshot() from public,anon,authenticated;

drop trigger if exists fill_chat_author_snapshot on public.chat_messages;
create trigger fill_chat_author_snapshot
before insert or update of user_id
on public.chat_messages
for each row execute function private.fill_chat_author_snapshot();

update public.chat_messages m
set
  author_username=p.username,
  author_display_name=p.display_name,
  author_avatar_url=p.avatar_url,
  author_role=p.role
from public.profiles p
where p.id=m.user_id
  and (
    m.author_username is distinct from p.username
    or m.author_display_name is distinct from p.display_name
    or m.author_avatar_url is distinct from p.avatar_url
    or m.author_role is distinct from p.role
  );
