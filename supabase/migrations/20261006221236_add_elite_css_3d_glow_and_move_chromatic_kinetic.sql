update public.visual_effect_catalog
set min_rank=2, sort_order=250
where effect_id='chromatic' and kind='name';

update public.visual_effect_catalog
set min_rank=2, sort_order=260
where effect_id='kinetic' and kind='name';

insert into public.visual_effect_catalog (
  effect_id,
  kind,
  label,
  description,
  min_rank,
  animated,
  interactive,
  owner_only,
  sort_order,
  enabled
)
values (
  'css-3d-glow',
  'name',
  '3D CSS Glow',
  'Dez camadas em profundidade 3D oscilam no espaço enquanto o brilho percorre vermelho, laranja, verde e ciano.',
  2,
  true,
  false,
  false,
  270,
  true
)
on conflict (effect_id) do update
set
  kind=excluded.kind,
  label=excluded.label,
  description=excluded.description,
  min_rank=excluded.min_rank,
  animated=excluded.animated,
  interactive=excluded.interactive,
  owner_only=excluded.owner_only,
  sort_order=excluded.sort_order,
  enabled=excluded.enabled;

update public.profile_cosmetics pc
set name_effect='clean', updated_at=now()
where pc.name_effect in ('chromatic','kinetic')
  and not exists (
    select 1
    from public.profiles p
    where p.id=pc.user_id
      and coalesce(p.system_owner,false)
  )
  and coalesce((
    select mp.rank
    from public.user_memberships um
    join public.membership_plans mp on mp.id=um.plan_id
    where um.user_id=pc.user_id
      and um.status='active'
      and (um.permanent or um.ends_at is null or um.ends_at>now())
    order by mp.rank desc
    limit 1
  ),0) < 2;
