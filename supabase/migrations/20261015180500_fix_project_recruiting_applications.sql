create or replace function public.get_project_recruiting_applications(p_opening_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_project uuid;
  v_rows jsonb:='[]'::jsonb;
begin
  select project_id into v_project from public.project_recruiting_openings where id=p_opening_id;
  if not found then raise exception 'Vaga não encontrada.'; end if;
  if not private.current_user_can_manage_project_recruiting(v_project) then
    raise exception 'Sua função não permite revisar candidaturas.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,
    'user_id',a.user_id,
    'message',a.message,
    'availability',a.availability,
    'portfolio_url',a.portfolio_url,
    'status',a.status,
    'review_note',a.review_note,
    'created_at',a.created_at,
    'reviewed_at',a.reviewed_at,
    'profile',jsonb_build_object(
      'id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,
      'occupation',p.occupation,'skills',to_jsonb(p.skills),'technologies',to_jsonb(p.technologies)
    ),
    'passport',case
      when x.cp is null then null
      when coalesce((x.cp->>'hidden')::boolean,false) then jsonb_build_object('hidden',true)
      else jsonb_build_object(
        'hidden',false,
        'passport_id',x.cp->>'passport_id',
        'score',x.cp->'score',
        'metrics',x.cp->'metrics',
        'areas',x.cp->'areas',
        'github',x.cp->'github'
      )
    end
  ) order by
      case a.status when 'pending' then 0 when 'shortlisted' then 1 when 'accepted' then 2 when 'rejected' then 3 else 4 end,
      a.created_at
  ),'[]'::jsonb)
  into v_rows
  from public.project_recruiting_applications a
  join public.profiles p on p.id=a.user_id
  left join lateral (select public.get_contribution_passport(a.user_id) as cp) x on true
  where a.opening_id=p_opening_id;

  return v_rows;
end;
$$;

revoke all on function public.get_project_recruiting_applications(uuid) from public;
grant execute on function public.get_project_recruiting_applications(uuid) to authenticated;
