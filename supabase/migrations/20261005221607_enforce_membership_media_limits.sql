create or replace function private.validate_membership_media_limits()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_entitlements jsonb;
  v_max_bytes bigint;
  v_max_count integer;
  v_count integer;
begin
  v_entitlements := private.membership_entitlements(new.user_id);
  v_max_bytes := greatest(
    10485760,
    coalesce((v_entitlements->>'forum_upload_mb')::bigint,10) * 1024 * 1024
  );
  v_max_count := greatest(
    4,
    coalesce((v_entitlements->>'forum_upload_count')::integer,4)
  );

  if new.size_bytes > v_max_bytes then
    raise exception 'Seu plano permite anexos de até % MB.', v_max_bytes / 1024 / 1024;
  end if;

  if new.topic_id is not null then
    select count(*) into v_count
    from public.media m
    where m.topic_id=new.topic_id;
  elsif new.post_id is not null then
    select count(*) into v_count
    from public.media m
    where m.post_id=new.post_id;
  else
    raise exception 'O anexo precisa estar ligado a uma publicação.';
  end if;

  if v_count >= v_max_count then
    raise exception 'Seu plano permite até % anexos por publicação.',v_max_count;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_membership_media_limits() from public,anon,authenticated;

drop trigger if exists validate_membership_media_limits on public.media;
create trigger validate_membership_media_limits
before insert on public.media
for each row execute function private.validate_membership_media_limits();
