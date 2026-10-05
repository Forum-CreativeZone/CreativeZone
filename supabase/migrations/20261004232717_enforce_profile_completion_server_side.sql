create or replace function private.compute_profile_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.profile_completed :=
    nullif(btrim(coalesce(new.occupation,'')),'') is not null
    and exists(
      select 1
      from public.account_settings s
      where s.user_id=new.id
        and s.birth_date is not null
    );
  return new;
end;
$$;

drop trigger if exists compute_profile_completion on public.profiles;
create trigger compute_profile_completion
before update of occupation on public.profiles
for each row execute function private.compute_profile_completion();

create or replace function private.sync_profile_completion_from_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles p
  set profile_completed =
    new.birth_date is not null
    and nullif(btrim(coalesce(p.occupation,'')),'') is not null
  where p.id=new.user_id;
  return new;
end;
$$;

drop trigger if exists sync_profile_completion_from_settings on public.account_settings;
create trigger sync_profile_completion_from_settings
after update of birth_date on public.account_settings
for each row execute function private.sync_profile_completion_from_settings();

revoke update(profile_completed) on public.profiles from authenticated;
