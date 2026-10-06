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
  'shadow-dance',
  'name',
  'Shadow Dance',
  'Sombras rosa e ciano alternam de lado em uma dança contínua de alto contraste.',
  2,
  true,
  false,
  false,
  210,
  true
)
on conflict (effect_id) do update
set
  kind = excluded.kind,
  label = excluded.label,
  description = excluded.description,
  min_rank = excluded.min_rank,
  animated = excluded.animated,
  interactive = excluded.interactive,
  owner_only = excluded.owner_only,
  sort_order = excluded.sort_order,
  enabled = excluded.enabled;

update public.membership_plans
set description = 'Benefícios premium, acesso Elite, ferramentas extras e animações de nome exclusivas.'
where id = 'elite';
