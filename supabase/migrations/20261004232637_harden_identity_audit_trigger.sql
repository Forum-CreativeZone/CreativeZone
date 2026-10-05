create or replace function private.audit_identity_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_provider text;
begin
  if tg_op='INSERT' then
    v_user := new.user_id;
    v_provider := new.provider;

    if exists(select 1 from public.profiles where id=v_user) then
      insert into public.account_audit_log(user_id,event_type,metadata)
      values(v_user,'identity_connected',jsonb_build_object('provider',v_provider));
    end if;
    return new;
  end if;

  v_user := old.user_id;
  v_provider := old.provider;

  if exists(select 1 from public.profiles where id=v_user) then
    insert into public.account_audit_log(user_id,event_type,metadata)
    values(v_user,'identity_disconnected',jsonb_build_object('provider',v_provider));
  end if;
  return old;
end;
$$;
