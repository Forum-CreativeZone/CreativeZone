-- Simplify CreativeZone cosmetics: only PRO-tier name effects remain selectable.

update public.profile_cosmetics
set
  name_color = null,
  profile_title = null,
  avatar_frame = 'avatar-clean',
  cover_effect = 'cover-clean',
  badge_style = 'default',
  badge_effect = 'clean-badge',
  role_effect = 'clean-role',
  profile_effect = 'none',
  name_effect = case
    when name_effect in ('clean','soft-shadow','accent-line','frost') then 'clean'
    else name_effect
  end,
  updated_at = now();

delete from public.visual_effect_catalog
where kind <> 'name';

delete from public.visual_effect_catalog
where kind = 'name' and min_rank = 0;

update public.visual_effect_catalog
set min_rank = 1
where kind = 'name';

update public.membership_plans
set entitlements =
  (coalesce(entitlements, '{}'::jsonb)
    - 'name_color'
    - 'custom_title'
    - 'avatar_frame'
    - 'animated_cover')
  || jsonb_build_object('name_effects', id in ('pro','elite'));

create or replace function private.validate_profile_cosmetics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rank integer := 0;
  v_owner boolean := false;
  v_required integer;
  v_owner_only boolean;
begin
  select coalesce(p.system_owner,false)
  into v_owner
  from public.profiles p
  where p.id = new.user_id;

  if coalesce(v_owner,false) then
    v_rank := 99;
  else
    select coalesce(mp.rank,0)
    into v_rank
    from public.profiles p
    left join public.user_memberships um
      on um.user_id = p.id
     and um.status = 'active'
     and (um.permanent or um.ends_at is null or um.ends_at > now())
    left join public.membership_plans mp on mp.id = um.plan_id
    where p.id = new.user_id
    limit 1;
    v_rank := coalesce(v_rank,0);
  end if;

  new.name_color := null;
  new.profile_title := null;
  new.avatar_frame := 'avatar-clean';
  new.cover_effect := 'cover-clean';
  new.badge_style := 'default';
  new.badge_effect := 'clean-badge';
  new.role_effect := 'clean-role';
  new.profile_effect := 'none';
  new.name_effect := coalesce(nullif(new.name_effect,''),'clean');

  if new.name_effect <> 'clean' then
    if v_rank < 1 and not v_owner then
      raise exception 'Efeitos de nome são exclusivos do CreativeZone PRO e superiores.';
    end if;

    select min_rank, owner_only
    into v_required, v_owner_only
    from public.visual_effect_catalog
    where effect_id = new.name_effect
      and kind = 'name'
      and enabled = true;

    if v_required is null
       or v_required > v_rank
       or (v_owner_only and not v_owner) then
      raise exception 'Efeito de nome indisponível para seu plano.';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.normalize_profile_cosmetics_for_membership(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner boolean := false;
  v_rank integer := 0;
begin
  select coalesce(system_owner,false)
  into v_owner
  from public.profiles
  where id = p_user;

  if coalesce(v_owner,false) then
    v_rank := 99;
  else
    select coalesce(mp.rank,0)
    into v_rank
    from public.profiles p
    left join public.user_memberships um
      on um.user_id = p.id
     and um.status = 'active'
     and (um.permanent or um.ends_at is null or um.ends_at > now())
    left join public.membership_plans mp on mp.id = um.plan_id
    where p.id = p_user
    limit 1;
    v_rank := coalesce(v_rank,0);
  end if;

  update public.profile_cosmetics pc
  set
    name_color = null,
    profile_title = null,
    badge_style = 'default',
    badge_effect = 'clean-badge',
    role_effect = 'clean-role',
    profile_effect = 'none',
    avatar_frame = 'avatar-clean',
    cover_effect = 'cover-clean',
    name_effect = case
      when pc.name_effect = 'clean' then 'clean'
      when exists (
        select 1
        from public.visual_effect_catalog e
        where e.effect_id = pc.name_effect
          and e.kind = 'name'
          and e.enabled
          and e.min_rank <= v_rank
          and (not e.owner_only or v_owner)
      ) then pc.name_effect
      else 'clean'
    end,
    updated_at = now()
  where pc.user_id = p_user;
end;
$$;
