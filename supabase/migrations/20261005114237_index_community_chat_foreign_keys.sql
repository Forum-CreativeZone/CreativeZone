
create index if not exists chat_messages_deleted_by_idx
  on public.chat_messages(deleted_by)
  where deleted_by is not null;

create index if not exists chat_mutes_moderator_id_idx
  on public.chat_mutes(moderator_id)
  where moderator_id is not null;

create index if not exists chat_bans_moderator_id_idx
  on public.chat_bans(moderator_id)
  where moderator_id is not null;
