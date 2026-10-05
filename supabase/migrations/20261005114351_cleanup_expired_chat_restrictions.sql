
create or replace function private.cleanup_chat_messages()
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  delete from public.chat_messages
  where created_at < now() - interval '30 days';

  delete from public.chat_mutes
  where muted_until <= now();

  delete from public.chat_bans
  where banned_until is not null
    and banned_until <= now();
end;
$$;
