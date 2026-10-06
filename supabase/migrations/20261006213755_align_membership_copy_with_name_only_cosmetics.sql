update public.membership_plans
set description = case id
  when 'pro' then 'Efeitos de nome avançados e benefícios extras para membros ativos.'
  when 'elite' then 'Benefícios premium, acesso Elite e ferramentas extras para criadores.'
  else description
end
where id in ('pro','elite');
