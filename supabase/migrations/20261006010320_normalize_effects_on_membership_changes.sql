create or replace function private.normalize_profile_cosmetics_for_membership(p_user uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_owner boolean := false;
  v_rank integer := 0;
begin
  select coalesce(system_owner,false)
  into v_owner
  from public.profiles
  where id=p_user;

  if coalesce(v_owner,false) then
    return;
  end if;

  select coalesce(mp.rank,0)
  into v_rank
  from public.profiles p
  left join public.user_memberships um
    on um.user_id=p.id
   and um.status='active'
   and (um.permanent or um.ends_at is null or um.ends_at>now())
  left join public.membership_plans mp on mp.id=um.plan_id
  where p.id=p_user
  limit 1;

  v_rank := coalesce(v_rank,0);

  update public.profile_cosmetics pc
  set
    name_color=case when v_rank>=1 then pc.name_color else null end,
    profile_title=case when v_rank>=1 then pc.profile_title else null end,
    avatar_frame=case
      when v_rank=0 then 'none'
      when v_rank=1 and pc.avatar_frame not in ('none','pro') then 'pro'
      when v_rank>=2 and pc.avatar_frame='architect' then 'elite'
      else pc.avatar_frame
    end,
    cover_effect=case
      when v_rank=0 then 'none'
      when v_rank=1 and pc.cover_effect not in ('none','subtle') then 'subtle'
      when v_rank>=2 and pc.cover_effect='architect' then 'elite'
      else pc.cover_effect
    end,
    badge_style=case
      when v_rank=0 then 'default'
      when v_rank=1 and pc.badge_style not in ('default','pro') then 'pro'
      when v_rank>=2 and pc.badge_style='architect' then 'elite'
      else pc.badge_style
    end,
    name_effect=case
      when exists(
        select 1 from public.visual_effect_catalog e
        where e.effect_id=pc.name_effect and e.kind='name' and e.enabled
          and not e.owner_only and e.min_rank<=v_rank
      ) then pc.name_effect else 'clean'
    end,
    badge_effect=case
      when exists(
        select 1 from public.visual_effect_catalog e
        where e.effect_id=pc.badge_effect and e.kind='badge' and e.enabled
          and not e.owner_only and e.min_rank<=v_rank
      ) then pc.badge_effect else 'clean-badge'
    end,
    role_effect=case
      when exists(
        select 1 from public.visual_effect_catalog e
        where e.effect_id=pc.role_effect and e.kind='role' and e.enabled
          and not e.owner_only and e.min_rank<=v_rank
      ) then pc.role_effect else 'clean-role'
    end,
    profile_effect=case
      when exists(
        select 1 from public.visual_effect_catalog e
        where e.effect_id=pc.profile_effect and e.kind='profile' and e.enabled
          and not e.owner_only and e.min_rank<=v_rank
      ) then pc.profile_effect else 'none'
    end,
    updated_at=now()
  where pc.user_id=p_user;
end;
$$;

revoke all on function private.normalize_profile_cosmetics_for_membership(uuid)
from public,anon,authenticated;

create or replace function private.normalize_cosmetics_after_membership_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.normalize_profile_cosmetics_for_membership(
    case when tg_op='DELETE' then old.user_id else new.user_id end
  );
  return coalesce(new,old);
end;
$$;

revoke all on function private.normalize_cosmetics_after_membership_change()
from public,anon,authenticated;

drop trigger if exists normalize_cosmetics_after_membership_change
on public.user_memberships;

create trigger normalize_cosmetics_after_membership_change
after insert or update or delete on public.user_memberships
for each row execute function private.normalize_cosmetics_after_membership_change();
