update public.membership_plans
set description=case id
  when 'free' then 'GitHub DevHub essencial para começar.'
  when 'pro' then 'Segurança e inteligência avançada para projetos.'
  when 'elite' then 'Dev Workspace, automação contínua e equipes privadas.'
  else description
end,
updated_at=now()
where id in ('free','pro','elite');
