
create or replace function private.sync_chat_author_snapshots()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if
    new.username is not distinct from old.username
    and new.display_name is not distinct from old.display_name
    and new.avatar_url is not distinct from old.avatar_url
    and new.role is not distinct from old.role
  then
    return new;
  end if;

  update public.chat_messages
  set
    author_username=new.username,
    author_display_name=new.display_name,
    author_avatar_url=new.avatar_url,
    author_role=new.role
  where user_id=new.id;

  return new;
end;
$$;

revoke all on function private.sync_chat_author_snapshots() from public,anon,authenticated;

drop trigger if exists sync_chat_author_snapshots on public.profiles;
create trigger sync_chat_author_snapshots
after update of username,display_name,avatar_url,role
on public.profiles
for each row execute function private.sync_chat_author_snapshots();
