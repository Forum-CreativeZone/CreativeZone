
create or replace function private.notify_staff_on_category_suggestion()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.notifications(user_id,actor_id,type,data)
  select
    p.id,
    new.user_id,
    'category_suggestion',
    jsonb_build_object(
      'category_suggestion_id',new.id,
      'suggested_name',new.suggested_name,
      'path','/categorias'
    )
  from public.profiles p
  where p.role in ('moderator','admin')
    and p.account_status='active';

  return new;
end;
$$;

revoke all on function private.notify_staff_on_category_suggestion() from public,anon,authenticated;

drop trigger if exists notify_staff_category_suggestion on public.category_suggestions;
create trigger notify_staff_category_suggestion
after insert on public.category_suggestions
for each row execute function private.notify_staff_on_category_suggestion();
