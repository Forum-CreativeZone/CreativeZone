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
  'melting',
  'name',
  'Melting',
  'Gradiente quente com duplicação luminosa e deformação vertical que simula o nome derretendo.',
  2,
  true,
  false,
  false,
  220,
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
