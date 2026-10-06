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
  'wave',
  'name',
  'Wave',
  'Cada letra sobe e desce em sequência, formando uma onda contínua pelo nome.',
  2,
  true,
  false,
  false,
  240,
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
