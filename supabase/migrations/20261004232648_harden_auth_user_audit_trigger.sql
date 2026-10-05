create or replace function private.audit_auth_user_updates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists(select 1 from public.profiles where id=new.id) then
    return new;
  end if;

  if new.email is distinct from old.email then
    insert into public.account_audit_log(user_id,event_type,metadata)
    values(new.id,'email_changed',jsonb_build_object('old_email',old.email,'new_email',new.email));
  end if;

  if new.encrypted_password is distinct from old.encrypted_password then
    insert into public.account_audit_log(user_id,event_type)
    values(new.id,'password_changed');
  end if;
  return new;
end;
$$;
