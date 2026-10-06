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
  'gsap-assemble',
  'name',
  'GSAP Assemble',
  'Os caracteres se espalham com rotação, escala e opacidade e depois se remontam em sequência; ao passar o mouse, a animação entra em câmera lenta.',
  2,
  true,
  true,
  false,
  290,
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
