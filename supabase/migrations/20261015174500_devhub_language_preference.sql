alter table public.account_settings
  add column if not exists devhub_language text not null default 'en'
  check (devhub_language in ('en','pt'));

create or replace function public.get_devhub_language()
returns text
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    (select s.devhub_language from public.account_settings s where s.user_id=(select auth.uid())),
    'en'
  )
$$;

create or replace function public.set_devhub_language(p_language text)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=(select auth.uid());
  v_language text;
begin
  if v_user is null then
    raise exception 'Autenticação necessária.';
  end if;
  v_language:=case when p_language='pt' then 'pt' else 'en' end;

  insert into public.account_settings(user_id,devhub_language)
  values(v_user,v_language)
  on conflict(user_id) do update
    set devhub_language=excluded.devhub_language,
        updated_at=now();

  return v_language;
end;
$$;

revoke all on function public.get_devhub_language() from public;
revoke all on function public.set_devhub_language(text) from public;
grant execute on function public.get_devhub_language() to authenticated;
grant execute on function public.set_devhub_language(text) to authenticated;
