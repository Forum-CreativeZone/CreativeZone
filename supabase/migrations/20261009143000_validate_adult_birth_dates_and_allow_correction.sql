-- Allow users to correct an incorrectly entered birth date, but enforce adult-only accounts.
drop trigger if exists lock_birth_date_after_set on public.account_settings;
drop function if exists private.birth_date_once();

create or replace function private.validate_adult_birth_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.birth_date is null then
    return new;
  end if;

  if new.birth_date > (current_date - interval '18 years')::date then
    raise exception 'A CreativeZone é exclusiva para maiores de 18 anos.'
      using errcode = '22007';
  end if;

  if new.birth_date < (current_date - interval '120 years')::date then
    raise exception 'Informe uma data de nascimento válida.'
      using errcode = '22007';
  end if;

  return new;
end;
$$;

create trigger validate_adult_birth_date
before insert or update of birth_date on public.account_settings
for each row
execute function private.validate_adult_birth_date();

-- Existing invalid dates remain editable, but those profiles must be corrected
-- before the account is considered complete.
update public.profiles p
set profile_completed = false
from public.account_settings s
where s.user_id = p.id
  and s.birth_date is not null
  and (
    s.birth_date > (current_date - interval '18 years')::date
    or s.birth_date < (current_date - interval '120 years')::date
  );
