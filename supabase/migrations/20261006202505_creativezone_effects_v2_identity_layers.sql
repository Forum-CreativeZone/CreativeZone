alter table public.visual_effect_catalog
  drop constraint if exists visual_effect_catalog_kind_check;

alter table public.visual_effect_catalog
  add constraint visual_effect_catalog_kind_check
  check (kind in ('name','badge','role','profile','avatar','cover'));

alter table public.profile_cosmetics
  drop constraint if exists profile_cosmetics_avatar_frame_check,
  drop constraint if exists profile_cosmetics_cover_effect_check;

insert into public.visual_effect_catalog
(effect_id,kind,label,description,min_rank,animated,interactive,owner_only,sort_order)
values
  ('laser-scan','name','Laser Scan','Feixe de luz percorre o nome com brilho técnico.',1,true,true,false,170),
  ('ember-flow','name','Ember Flow','Faíscas e calor luminoso em movimento.',1,true,false,false,180),
  ('liquid-chrome','name','Liquid Chrome','Metal líquido com reflexos móveis que respondem ao cursor.',2,true,true,false,300),
  ('magnetic','name','Magnetic Letters','O nome inclina e é atraído suavemente pelo cursor.',2,true,true,false,310),
  ('energy-trail','name','Energy Trail','Rastro luminoso reativo acompanha o texto.',2,true,true,false,320),
  ('heat-haze','name','Heat Distortion','Calor, refração e duplicação cromática pulsante.',2,true,true,false,330),
  ('split-glow-badge','badge','Split Glow','Duas linhas de energia atravessam a insígnia.',1,true,true,false,160),
  ('crystal-badge','badge','Elite Crystal','Cristal angular translúcido com profundidade.',2,true,true,false,270),
  ('holo-chip-badge','badge','Holo Chip','Placa holográfica com trilhas de circuito animadas.',2,true,true,false,280),
  ('living-border-badge','badge','Living Border','Borda de energia circula continuamente pela insígnia.',2,true,true,false,290),
  ('morph-badge','badge','Morph','A forma da insígnia se transforma suavemente no hover.',2,true,true,false,300),
  ('signal-role','role','Signal','Faixa luminosa de autoridade com pulso controlado.',1,true,true,false,130),
  ('command-role','role','Command Core','Cargo Elite com núcleo de energia e resposta ao cursor.',2,true,true,false,240),
  ('depth-hud','profile','Depth HUD','Camadas de profundidade, luz reativa e HUD técnico.',2,true,true,false,240),
  ('living-interface','profile','Living Interface','Shader WebGL leve com energia dinâmica reativa ao mouse.',2,true,true,false,250),
  ('avatar-clean','avatar','Clean Ring','Moldura limpa e nítida.',0,false,false,false,10),
  ('avatar-frost-ring','avatar','Frost Ring','Aro frio translúcido com leve brilho.',0,false,false,false,20),
  ('avatar-accent-ring','avatar','Accent Ring','Aro duplo com destaque da CreativeZone.',0,false,false,false,30),
  ('avatar-energy-ring','avatar','Energy Ring','Energia percorre o perímetro do avatar.',1,true,true,false,110),
  ('avatar-neon-segments','avatar','Neon Segments','Segmentos neon giram lentamente ao redor da foto.',1,true,true,false,120),
  ('avatar-light-orbit','avatar','Light Orbit','Ponto luminoso orbita uma moldura premium.',1,true,true,false,130),
  ('avatar-plasma-orbit','avatar','Plasma Orbit','Plasma e partículas orbitais em várias camadas.',2,true,true,false,210),
  ('avatar-cyber-segments','avatar','Cyber Segments','Anéis técnicos segmentados com rotação oposta.',2,true,true,false,220),
  ('avatar-electric-arc','avatar','Electric Arc','Descargas elétricas aparecem entre pontos da moldura.',2,true,true,false,230),
  ('avatar-liquid-neon','avatar','Liquid Neon','Fluxo neon líquido circula ao redor do avatar.',2,true,true,false,240),
  ('avatar-royal-crown','avatar','Royal Crown','Moldura real dourada com coroa geométrica.',2,true,true,false,250),
  ('avatar-architect-core','avatar','Architect Core Frame','Núcleo técnico vermelho e dourado exclusivo do Arquiteto.',2,true,true,true,299),
  ('cover-clean','cover','Clean Edge','Capa sem animação adicional.',0,false,false,false,10),
  ('cover-soft-vignette','cover','Soft Vignette','Vinheta sutil para destacar o centro da capa.',0,false,false,false,20),
  ('cover-accent-edge','cover','Accent Edge','Linha de destaque discreta nas bordas.',0,false,false,false,30),
  ('cover-scanning-border','cover','Scanning Border','Luz percorre o perímetro da capa.',1,true,true,false,110),
  ('cover-light-sweep','cover','Light Sweep','Feixe diagonal atravessa a capa periodicamente.',1,true,true,false,120),
  ('cover-glass-edge','cover','Glass Edge','Borda de vidro com reflexo e profundidade.',1,true,true,false,130),
  ('cover-holo-corners','cover','Holographic Corners','Cantos holográficos reativos ao cursor.',2,true,true,false,210),
  ('cover-energy-perimeter','cover','Energy Perimeter','Energia circula pelas quatro bordas da capa.',2,true,true,false,220),
  ('cover-parallax','cover','Parallax Cover','Imagem reage ao cursor criando profundidade 3D.',2,true,true,false,230),
  ('cover-cyber-grid','cover','Cyber Grid','Grade digital, scanner e pontos de energia.',2,true,true,false,240),
  ('cover-elite-portal','cover','Elite Portal','Perímetro com efeito de portal energético.',2,true,true,false,250),
  ('cover-architect-grid','cover','Architect Perimeter','Grade técnica, scanner e energia exclusivos do Arquiteto.',2,true,true,true,299)
on conflict(effect_id) do update
set kind=excluded.kind,label=excluded.label,description=excluded.description,
    min_rank=excluded.min_rank,animated=excluded.animated,interactive=excluded.interactive,
    owner_only=excluded.owner_only,sort_order=excluded.sort_order,enabled=true;

create or replace function private.validate_profile_cosmetics()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_rank integer := 0;
  v_owner boolean := false;
  v_required integer;
  v_owner_only boolean;
begin
  select coalesce(p.system_owner,false) into v_owner
  from public.profiles p where p.id=new.user_id;

  if coalesce(v_owner,false) then
    v_rank := 99;
  else
    select coalesce(mp.rank,0) into v_rank
    from public.profiles p
    left join public.user_memberships um
      on um.user_id=p.id
     and um.status='active'
     and (um.permanent or um.ends_at is null or um.ends_at>now())
    left join public.membership_plans mp on mp.id=um.plan_id
    where p.id=new.user_id limit 1;
    v_rank := coalesce(v_rank,0);
  end if;

  if not coalesce(v_owner,false) then
    if v_rank=0 and (new.name_color is not null or new.profile_title is not null or new.badge_style<>'default') then
      raise exception 'Cor personalizada, título e estrutura premium de insígnia exigem CreativeZone Pro ou Elite.';
    elsif v_rank=1 and new.badge_style not in ('default','pro') then
      raise exception 'Esta estrutura de insígnia exige CreativeZone Elite.';
    elsif v_rank>=2 and new.badge_style='architect' then
      raise exception 'A identidade Arquiteto CreativeZone é exclusiva do proprietário da plataforma.';
    end if;
  end if;

  select min_rank,owner_only into v_required,v_owner_only from public.visual_effect_catalog where effect_id=new.name_effect and kind='name' and enabled=true;
  if v_required is null or v_required>v_rank or (v_owner_only and not v_owner) then raise exception 'Efeito de nome indisponível para seu plano.'; end if;
  select min_rank,owner_only into v_required,v_owner_only from public.visual_effect_catalog where effect_id=new.badge_effect and kind='badge' and enabled=true;
  if v_required is null or v_required>v_rank or (v_owner_only and not v_owner) then raise exception 'Efeito de insígnia indisponível para seu plano.'; end if;
  select min_rank,owner_only into v_required,v_owner_only from public.visual_effect_catalog where effect_id=new.role_effect and kind='role' and enabled=true;
  if v_required is null or v_required>v_rank or (v_owner_only and not v_owner) then raise exception 'Efeito de cargo indisponível para seu plano.'; end if;
  select min_rank,owner_only into v_required,v_owner_only from public.visual_effect_catalog where effect_id=new.profile_effect and kind='profile' and enabled=true;
  if v_required is null or v_required>v_rank or (v_owner_only and not v_owner) then raise exception 'Efeito de perfil indisponível para seu plano.'; end if;
  select min_rank,owner_only into v_required,v_owner_only from public.visual_effect_catalog where effect_id=new.avatar_frame and kind='avatar' and enabled=true;
  if v_required is null or v_required>v_rank or (v_owner_only and not v_owner) then raise exception 'Moldura de avatar indisponível para seu plano.'; end if;
  select min_rank,owner_only into v_required,v_owner_only from public.visual_effect_catalog where effect_id=new.cover_effect and kind='cover' and enabled=true;
  if v_required is null or v_required>v_rank or (v_owner_only and not v_owner) then raise exception 'Efeito de capa indisponível para seu plano.'; end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.validate_profile_cosmetics() from public,anon,authenticated;

update public.profile_cosmetics
set avatar_frame=case avatar_frame
      when 'pro' then 'avatar-energy-ring'
      when 'elite' then 'avatar-plasma-orbit'
      when 'architect' then 'avatar-architect-core'
      else 'avatar-clean'
    end,
    cover_effect=case cover_effect
      when 'subtle' then 'cover-scanning-border'
      when 'elite' then 'cover-energy-perimeter'
      when 'architect' then 'cover-architect-grid'
      else 'cover-clean'
    end,
    updated_at=now();

alter table public.profile_cosmetics
  alter column avatar_frame set default 'avatar-clean',
  alter column cover_effect set default 'cover-clean';

alter table public.profile_cosmetics
  add constraint profile_cosmetics_avatar_frame_check check (avatar_frame ~ '^[a-z0-9][a-z0-9-]{0,49}$'),
  add constraint profile_cosmetics_cover_effect_check check (cover_effect ~ '^[a-z0-9][a-z0-9-]{0,49}$');

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
  select coalesce(system_owner,false) into v_owner from public.profiles where id=p_user;
  if coalesce(v_owner,false) then return; end if;

  select coalesce(mp.rank,0) into v_rank
  from public.profiles p
  left join public.user_memberships um
    on um.user_id=p.id
   and um.status='active'
   and (um.permanent or um.ends_at is null or um.ends_at>now())
  left join public.membership_plans mp on mp.id=um.plan_id
  where p.id=p_user limit 1;
  v_rank := coalesce(v_rank,0);

  update public.profile_cosmetics pc
  set
    name_color=case when v_rank>=1 then pc.name_color else null end,
    profile_title=case when v_rank>=1 then pc.profile_title else null end,
    badge_style=case when v_rank=0 then 'default' when v_rank=1 and pc.badge_style not in ('default','pro') then 'pro' when v_rank>=2 and pc.badge_style='architect' then 'elite' else pc.badge_style end,
    name_effect=case when exists(select 1 from public.visual_effect_catalog e where e.effect_id=pc.name_effect and e.kind='name' and e.enabled and not e.owner_only and e.min_rank<=v_rank) then pc.name_effect else 'clean' end,
    badge_effect=case when exists(select 1 from public.visual_effect_catalog e where e.effect_id=pc.badge_effect and e.kind='badge' and e.enabled and not e.owner_only and e.min_rank<=v_rank) then pc.badge_effect else 'clean-badge' end,
    role_effect=case when exists(select 1 from public.visual_effect_catalog e where e.effect_id=pc.role_effect and e.kind='role' and e.enabled and not e.owner_only and e.min_rank<=v_rank) then pc.role_effect else 'clean-role' end,
    profile_effect=case when exists(select 1 from public.visual_effect_catalog e where e.effect_id=pc.profile_effect and e.kind='profile' and e.enabled and not e.owner_only and e.min_rank<=v_rank) then pc.profile_effect else 'none' end,
    avatar_frame=case when exists(select 1 from public.visual_effect_catalog e where e.effect_id=pc.avatar_frame and e.kind='avatar' and e.enabled and not e.owner_only and e.min_rank<=v_rank) then pc.avatar_frame else 'avatar-clean' end,
    cover_effect=case when exists(select 1 from public.visual_effect_catalog e where e.effect_id=pc.cover_effect and e.kind='cover' and e.enabled and not e.owner_only and e.min_rank<=v_rank) then pc.cover_effect else 'cover-clean' end,
    updated_at=now()
  where pc.user_id=p_user;
end;
$$;

revoke all on function private.normalize_profile_cosmetics_for_membership(uuid) from public,anon,authenticated;

update public.profile_cosmetics pc
set avatar_frame='avatar-architect-core',cover_effect='cover-architect-grid',updated_at=now()
from public.profiles p
where p.id=pc.user_id and p.system_owner=true;
