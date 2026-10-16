# CreativeZone — Índice de Documentação

Este diretório é o ponto central da documentação técnica e funcional da CreativeZone.

## Regra de documentação

A partir de agora, cada sistema ou funcionalidade relevante deve ter:

1. **documentação técnica no GitHub**;
2. **referência curta no README principal**, quando fizer sentido;
3. **tópico público no fórum**, explicando em linguagem clara o que é, como funciona e como usar;
4. **estado de implementação/homologação**;
5. **segurança e privacidade**, quando aplicável;
6. **FREE / PRO / ELITE**, quando houver diferença de plano;
7. **arquivos, migrations, Edge Functions e integrações** envolvidos;
8. **atualização do tópico/documentação** sempre que o comportamento mudar.

O README principal deve continuar resumido. A documentação completa fica neste diretório e os guias para membros ficam no fórum.

---

## Sistemas documentados

### CreativeZone Link Preview

**Função:** previews ricos de URLs, Open Graph, JSON-LD e metadata.

- GitHub: [creativezone-link-preview/README.md](./creativezone-link-preview/README.md)
- Fórum: https://forum.creativezone.pro/topico/creativezone-link-preview-guia-oficial--3f7e4b3d-30fd-4ef2-ae7c-66f99d186925
- Estado: implementado

### CreativeZone Security

**Função:** auditoria de dependências, OSV, Security Score e automações de segurança.

- GitHub: [creativezone-security/README.md](./creativezone-security/README.md)
- Fórum: https://forum.creativezone.pro/topico/creativezone-security-auditoria-projetos-dependencias--7a24f5be-d1d6-4965-8f19-6b078c48a7e5
- Estado: implementado

### CreativeZone DevHub

**Função:** workspace conectado ao GitHub real, Code Studio, Monaco, xterm.js, Issues, PRs, Actions, Kanban, equipes e segurança.

- Guia completo: [CREATIVEZONE_DEVHUB_GUIA_COMPLETO.md](./CREATIVEZONE_DEVHUB_GUIA_COMPLETO.md)
- Arquitetura: [creativezone-devhub-architecture.md](./creativezone-devhub-architecture.md)
- Fórum: https://forum.creativezone.pro/topico/creativezone-github-devhub-organizacao-oficial-projetos-colaborativos--669c591f-a72d-469d-86bf-17d4cc8d06d3
- Estado: implementado e homologado

### CreativeZone Link Shield

**Função:** proteção de URLs, reputação, URLhaus, bloqueio preventivo de previews e avisos de risco.

- GitHub: [creativezone-link-shield/README.md](./creativezone-link-shield/README.md)
- Fórum: https://forum.creativezone.pro/topico/creativezone-link-shield-protecao-inteligente-de-links--d47f4fe0-9ca7-4bf0-b639-33738393c727
- Estado: implementado e homologado

### CreativeZone Moderation Assist

**Função:** denúncias + triagem assistida de tópicos, respostas e chat, com decisão humana.

- GitHub: [creativezone-moderation/README.md](./creativezone-moderation/README.md)
- Fórum: https://forum.creativezone.pro/topico/creativezone-moderation-assist-como-funciona--f80349c0-dd63-4157-9573-d9d75ba14066
- Estado: v1 implementada

---

### CreativeZone REA Lab

**Função:** engenharia reversa assistida, evidências, Behavior Specification e reconstrução independente.

- GitHub: [creativezone-rea-lab/README.md](./creativezone-rea-lab/README.md)
- Fórum: https://forum.creativezone.pro/topico/creativezone-rea-lab-engenharia-reversa-assistida--8dc7a209-8f23-48b2-91d2-29b2f04c9a3e
- Estado: worker Railway ativo; secrets conectados; smoke test JavaScript concluído

---

## Próximos sistemas

A próxima subetapa do REA Lab é habilitar upload privado e ampliar os targets suportados, mantendo a execução fora do processo web do fórum.

---

## Princípio

> Código, documentação e comunicação com a comunidade devem evoluir juntos.

Nenhum sistema importante deve ser considerado concluído sem documentação técnica e explicação pública correspondente.
