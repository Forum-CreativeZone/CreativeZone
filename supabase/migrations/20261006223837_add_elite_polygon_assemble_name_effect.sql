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
  'polygon-assemble',
  'name',
  'Polygon Assemble',
  'Cada letra é dividida em fragmentos geométricos que se espalham, giram e se remontam com GSAP; no hover a animação entra em câmera lenta.',
  2,
  true,
  true,
  false,
  300,
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
