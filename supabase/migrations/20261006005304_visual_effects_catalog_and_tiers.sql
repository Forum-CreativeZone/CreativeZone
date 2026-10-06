create table if not exists public.visual_effect_catalog (
  effect_id text primary key,
  kind text not null check (kind in ('name','badge','role','profile')),
  label text not null,
  description text not null default '',
  min_rank smallint not null default 0 check (min_rank between 0 and 2),
  animated boolean not null default false,
  interactive boolean not null default false,
  owner_only boolean not null default false,
  sort_order smallint not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint visual_effect_catalog_effect_id_check
    check (effect_id ~ '^[a-z0-9][a-z0-9-]{0,49}$')
);

alter table public.visual_effect_catalog enable row level security;

drop policy if exists "visual effects public read" on public.visual_effect_catalog;
create policy "visual effects public read"
on public.visual_effect_catalog for select
to anon, authenticated
using (enabled=true);

grant select on public.visual_effect_catalog to anon, authenticated;

create index if not exists visual_effect_catalog_kind_rank_idx
  on public.visual_effect_catalog(kind,min_rank,sort_order)
  where enabled=true;

insert into public.visual_effect_catalog
(effect_id,kind,label,description,min_rank,animated,interactive,owner_only,sort_order)
values
  ('clean','name','Clean','Tipografia limpa e nítida.',0,false,false,false,10),
  ('soft-shadow','name','Soft Shadow','Sombra suave e elegante.',0,false,false,false,20),
  ('accent-line','name','Accent Line','Linha de destaque discreta.',0,true,false,false,30),
  ('frost','name','Frost','Gradiente frio estático.',0,false,false,false,40),
  ('neon-red','name','Neon Red','Glow vermelho com respiração luminosa.',1,true,false,false,110),
  ('neon-cyan','name','Neon Cyan','Neon ciano com profundidade.',1,true,false,false,120),
  ('gradient-flow','name','Gradient Flow','Gradiente contínuo em movimento.',1,true,false,false,130),
  ('gold-sheen','name','Gold Sheen','Dourado metálico com reflexo.',1,true,true,false,140),
  ('aurora','name','Aurora','Fluxo de cores inspirado em aurora.',1,true,false,false,150),
  ('pulse-glow','name','Pulse Glow','Pulso luminoso suave.',1,true,false,false,160),
  ('holographic','name','Holographic','Prisma holográfico animado.',2,true,true,false,210),
  ('inferno','name','Inferno','Fogo vermelho e laranja pulsante.',2,true,true,false,220),
  ('electric','name','Electric','Descargas azul-violeta e brilho intenso.',2,true,true,false,230),
  ('chromatic','name','Chromatic Shift','Aberração cromática animada.',2,true,true,false,240),
  ('fracture','name','Fracture','Nome se fragmenta e recompõe com GSAP.',2,true,true,false,250),
  ('kinetic','name','Kinetic Wave','Letras em movimento cinético com GSAP.',2,true,true,false,260),
  ('scramble','name','Cipher Scramble','Entrada e hover com embaralhamento digital.',2,true,true,false,270),
  ('plasma','name','Plasma','Fluxo energético rosa, roxo e azul.',2,true,true,false,280),
  ('void','name','Void','Brilho profundo com distorção espectral.',2,true,true,false,290),
  ('architect-core','name','Architect Core','Efeito exclusivo do Arquiteto CreativeZone.',2,true,true,true,299),
  ('clean-badge','badge','Clean','Insígnia limpa e profissional.',0,false,false,false,10),
  ('outline-badge','badge','Outline','Contorno refinado.',0,false,false,false,20),
  ('soft-glow-badge','badge','Soft Glow','Glow discreto para insígnias.',0,true,false,false,30),
  ('neon-badge','badge','Neon','Borda neon animada.',1,true,true,false,110),
  ('shimmer-badge','badge','Shimmer','Reflexo percorrendo a insígnia.',1,true,true,false,120),
  ('metallic-badge','badge','Metallic','Metal escovado premium.',1,true,false,false,130),
  ('pulse-badge','badge','Pulse','Pulso luminoso controlado.',1,true,false,false,140),
  ('gradient-border-badge','badge','Gradient Border','Borda gradiente viva.',1,true,true,false,150),
  ('holographic-badge','badge','Holographic','Holografia multicor interativa.',2,true,true,false,210),
  ('plasma-badge','badge','Plasma','Energia plasma em movimento.',2,true,true,false,220),
  ('electric-badge','badge','Electric','Descargas visuais em volta da insígnia.',2,true,true,false,230),
  ('prism-badge','badge','Prism','Refração prismática animada.',2,true,true,false,240),
  ('orbit-badge','badge','Orbit','Partículas orbitais CSS de baixa carga.',2,true,true,false,250),
  ('fracture-badge','badge','Fracture','Entrada fragmentada e brilho reativo.',2,true,true,false,260),
  ('architect-forge','badge','Architect Forge','Insígnia exclusiva do Arquiteto CreativeZone.',2,true,true,true,299),
  ('clean-role','role','Clean','Cargo com acabamento limpo.',0,false,false,false,10),
  ('stripe-role','role','Stripe','Faixa sutil de autoridade.',0,false,false,false,20),
  ('metallic-role','role','Metallic','Cargo metálico com reflexo.',1,true,false,false,110),
  ('neon-role','role','Neon','Cargo com glow animado.',1,true,true,false,120),
  ('royal-role','role','Royal','Cargo Elite com acabamento real.',2,true,true,false,210),
  ('electric-role','role','Electric','Cargo com pulsos elétricos.',2,true,true,false,220),
  ('holo-role','role','Holographic','Cargo holográfico responsivo.',2,true,true,false,230),
  ('architect-role','role','Architect Authority','Cargo exclusivo do Arquiteto.',2,true,true,true,299),
  ('none','profile','Sem efeito','Perfil sem efeito adicional.',0,false,false,false,10),
  ('edge-light','profile','Edge Light','Luz de borda discreta.',0,false,false,false,20),
  ('glass-profile','profile','Glass','Profundidade e brilho de vidro.',1,true,true,false,110),
  ('spotlight-profile','profile','Spotlight','Luz que reage ao cursor.',1,true,true,false,120),
  ('aurora-profile','profile','Aurora','Aurora animada no contorno.',2,true,true,false,210),
  ('cosmic-profile','profile','Cosmic','Campo luminoso profundo e interativo.',2,true,true,false,220),
  ('prism-profile','profile','Prism','Reflexo prismático em movimento.',2,true,true,false,230),
  ('architect-grid','profile','Architect Grid','Matriz técnica exclusiva do Arquiteto.',2,true,true,true,299)
on conflict(effect_id) do update
set kind=excluded.kind,label=excluded.label,description=excluded.description,
    min_rank=excluded.min_rank,animated=excluded.animated,interactive=excluded.interactive,
    owner_only=excluded.owner_only,sort_order=excluded.sort_order,enabled=true;

alter table public.profile_cosmetics
  add column if not exists name_effect text not null default 'clean',
  add column if not exists badge_effect text not null default 'clean-badge',
  add column if not exists role_effect text not null default 'clean-role',
  add column if not exists profile_effect text not null default 'none';

create or replace function private.validate_profile_cosmetics()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_plan text := 'free';
  v_rank integer := 0;
  v_owner boolean := false;
  v_required integer;
  v_owner_only boolean;
begin
  select coalesce(p.system_owner,false) into v_owner
  from public.profiles p where p.id=new.user_id;

  if coalesce(v_owner,false) then
    v_plan := 'elite';
    v_rank := 99;
  else
    select coalesce(um.plan_id,'free'),coalesce(mp.rank,0)
    into v_plan,v_rank
    from public.profiles p
    left join public.user_memberships um
      on um.user_id=p.id
     and um.status='active'
     and (um.permanent or um.ends_at is null or um.ends_at>now())
    left join public.membership_plans mp on mp.id=um.plan_id
    where p.id=new.user_id
    limit 1;
    v_plan := coalesce(v_plan,'free');
    v_rank := coalesce(v_rank,0);
  end if;

  if not coalesce(v_owner,false) then
    if v_plan='free' then
      if new.name_color is not null
         or new.profile_title is not null
         or new.avatar_frame<>'none'
         or new.cover_effect<>'none'
         or new.badge_style<>'default' then
        raise exception 'Este recurso de personalização exige CreativeZone Pro ou Elite.';
      end if;
    elsif v_plan='pro' then
      if new.avatar_frame not in ('none','pro')
         or new.cover_effect not in ('none','subtle')
         or new.badge_style not in ('default','pro') then
        raise exception 'Esta personalização exige CreativeZone Elite.';
      end if;
    elsif v_plan='elite' then
      if new.avatar_frame='architect'
         or new.cover_effect='architect'
         or new.badge_style='architect' then
        raise exception 'A identidade Arquiteto CreativeZone é exclusiva do proprietário da plataforma.';
      end if;
    end if;
  end if;

  select min_rank,owner_only into v_required,v_owner_only
  from public.visual_effect_catalog
  where effect_id=new.name_effect and kind='name' and enabled=true;
  if v_required is null or v_required>v_rank or (v_owner_only and not v_owner) then
    raise exception 'Efeito de nome indisponível para seu plano.';
  end if;

  select min_rank,owner_only into v_required,v_owner_only
  from public.visual_effect_catalog
  where effect_id=new.badge_effect and kind='badge' and enabled=true;
  if v_required is null or v_required>v_rank or (v_owner_only and not v_owner) then
    raise exception 'Efeito de insígnia indisponível para seu plano.';
  end if;

  select min_rank,owner_only into v_required,v_owner_only
  from public.visual_effect_catalog
  where effect_id=new.role_effect and kind='role' and enabled=true;
  if v_required is null or v_required>v_rank or (v_owner_only and not v_owner) then
    raise exception 'Efeito de cargo indisponível para seu plano.';
  end if;

  select min_rank,owner_only into v_required,v_owner_only
  from public.visual_effect_catalog
  where effect_id=new.profile_effect and kind='profile' and enabled=true;
  if v_required is null or v_required>v_rank or (v_owner_only and not v_owner) then
    raise exception 'Efeito de perfil indisponível para seu plano.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.validate_profile_cosmetics() from public,anon,authenticated;

update public.profile_cosmetics pc
set name_effect='architect-core',
    badge_effect='architect-forge',
    role_effect='architect-role',
    profile_effect='architect-grid',
    updated_at=now()
from public.profiles p
where p.id=pc.user_id
  and p.system_owner=true;
