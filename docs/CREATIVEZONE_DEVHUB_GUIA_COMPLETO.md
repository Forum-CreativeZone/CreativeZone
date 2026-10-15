# CreativeZone DevHub — Guia Completo

> Estado validado em 15/10/2026 no repositório `Forum-CreativeZone/CreativeZone` e no projeto Supabase `forum`.

## 1. Visão geral

O CreativeZone DevHub transforma a área de Projetos do fórum em um workspace integrado ao GitHub. A camada atual combina:

- leitura do repositório real e metadados do GitHub;
- README renderizado;
- Issues e Pull Requests;
- histórico de commits e releases;
- GitHub Actions;
- Security/OSV;
- Project Studio;
- Kanban;
- Recruiting;
- Contribution Passport;
- atividade do projeto;
- equipes, convites, funções e permissões;
- integrações por Edge Functions e Webhooks.

As permissões críticas são validadas no backend. A interface não deve ser tratada como barreira de segurança.

## 2. Planos e benefícios do DevHub

### FREE

Limite: **1 repositório**.

Inclui:

- reconhecimento de repositório;
- dados básicos do repositório;
- card GitHub;
- resumo/visualização do README;
- release mais recente;
- verificação OSV básica;
- status público de segurança.

Não inclui repositório privado, Issues avançadas, Pull Requests, Actions, histórico completo, grafo de dependências, scan agendado ou Project Studio.

### PRO

Limite: **5 repositórios**.

Inclui tudo do FREE e também:

- Issues;
- Pull Requests;
- commits recentes;
- histórico;
- histórico de releases;
- Actions status;
- linguagens detalhadas;
- SBOM;
- dependências de desenvolvimento;
- grafo de dependências;
- OSV completo;
- scan ao conectar;
- rescan agendado;
- Project Health.

Não inclui Project Studio, commits feitos pelo fórum, CI Cockpit, Security Gate, scan de Pull Request, alertas em tempo real, automação branch/PR, auto-fix nem repositório privado.

### ELITE

Limite: **ilimitado**.

Inclui tudo do PRO e também:

- repositórios privados;
- Project Studio;
- commits pelo fórum;
- workflow branch + Pull Request;
- CI Cockpit;
- Security Gate;
- scan em Pull Requests;
- push scan;
- alertas em tempo real;
- auto-fix;
- equipes privadas;
- tópicos privados de equipe;
- preview público controlado de tópicos;
- gerenciamento de funções de equipe.

## 3. Matriz de funções do projeto

### Owner

Controle total do projeto, inclusive ações destrutivas. Pode administrar código, Issues, PRs, Kanban, equipe, configurações, segurança, Recruiting e funções.

### Maintainer

Administração operacional ampla. Pode editar código, gerenciar Issues, revisar/mesclar PRs, administrar Kanban, convidar membros, operar Actions, segurança, configurações e Recruiting.

**Não pode** executar ações destrutivas de propriedade nem alterar funções da equipe como Owner.

### Developer

Pode ler e editar código, criar Issues e PRs, comentar, trabalhar no Kanban, usar terminal e executar código.

Não pode mesclar PRs, administrar equipe, segurança ou configurações.

### Reviewer

Acesso de leitura com comentários em Issues e revisão de Pull Requests. Sem escrita de código, terminal, administração ou ações destrutivas.

### Designer

Pode editar apenas caminhos de repositório autorizados, criar/comentar Issues, comentar PRs e participar de cards atribuídos no Kanban.

### Member

Colaborador da comunidade com leitura, criação/comentários em Issues e participação em cards atribuídos.

### Viewer

Somente leitura nas áreas de desenvolvimento.

## 4. Poder total operacional

O Owner pode conceder acesso operacional amplo a outra pessoa sem transferir a propriedade.

Esse acesso não deve liberar ações destrutivas reservadas ao Owner, como:

- excluir projeto;
- transferir propriedade;
- desvincular infraestrutura crítica;
- apagar dados importantes;
- conceder privilégios destrutivos equivalentes ao proprietário.

## 5. Componentes de backend validados

Tabelas centrais do DevHub:

- `github_connections`;
- `github_installations`;
- `project_repositories`;
- `github_devhub_repositories`;
- `github_devhub_actions`;
- `project_github_events`;
- `github_dependencies`;
- `github_vulnerabilities`;
- `project_security_reports`;
- `project_security_audits`;
- `project_security_state`;
- `project_activity_feed`;
- `project_kanban_columns`;
- `project_kanban_cards`;
- `project_kanban_comments`;
- `project_kanban_history`;
- `project_recruiting_openings`;
- `project_recruiting_applications`;
- `project_role_permissions`;
- `project_member_invites`;
- `github_org_membership_requests`;
- `github_org_sync_state`.

Todas as tabelas acima estão sob RLS.

## 6. Edge Functions do DevHub

Funções validadas como ativas:

- `github-api`;
- `github-auth`;
- `github-community`;
- `github-security-scan`;
- `github-studio`;
- `github-webhook`;
- `security-audit`;
- `teams-api`.

O envio de notificações/e-mails usa também a função `send-community-email`.

## 7. Segurança e autorização

A matriz de permissões é persistida em `project_role_permissions`.

As RPCs de permissões, equipe, Kanban e Recruiting foram endurecidas para:

- remover execução por `anon`;
- exigir usuário autenticado;
- aplicar validação de papel/capacidade no backend;
- evitar depender apenas de botões ocultos na interface;
- proteger dados de projetos privados por RLS.

As ações destrutivas permanecem exclusivas do Owner.

## 8. GitHub como fonte real

O DevHub deve apresentar dados reais do repositório conectado. Isso inclui, conforme o plano e a permissão do usuário:

- estrutura de arquivos e pastas;
- README;
- branches;
- commits;
- Issues;
- Pull Requests;
- Actions;
- releases;
- linguagens;
- dependências;
- estado de segurança.

Dados simulados, placeholders e solicitações locais que não existam no GitHub não devem ser apresentados como estado real.

## 9. Kanban

O Kanban possui permissões por função no backend.

- Owner/Maintainer: administração completa.
- Developer: criação e edição operacional.
- Designer/Member: participação limitada a cards permitidos/atribuídos.
- Reviewer/Viewer: leitura conforme a função.

As regras de UI devem refletir as capacidades retornadas pelo backend.

## 10. Recruiting

A área de Recruiting usa vagas e candidaturas ligadas ao projeto.

A revisão de candidaturas exige permissão administrativa apropriada. As notificações e e-mails do fluxo estão integrados ao sistema da comunidade.

## 11. Contribution Passport

O Contribution Passport consolida contribuição e participação do usuário no projeto, respeitando privacidade e atribuição.

Ele não substitui a autorização do projeto; é uma camada de histórico/reputação.

## 12. Equipes e convites

Convites de projeto usam `project_member_invites` e seguem a função escolhida pelo Owner/Maintainer autorizado.

O sistema suporta funções avançadas:

- owner;
- maintainer;
- developer;
- reviewer;
- designer;
- member;
- viewer.

O histórico/visibilidade dos convites segue RLS e as capacidades da função.

## 13. Auditoria funcional concluída

Foram conferidos:

- existência dos três planos;
- entitlements DevHub por FREE, PRO e ELITE;
- limites de repositórios: 1 / 5 / ilimitado;
- matriz de sete funções do projeto;
- bloqueio de execução anônima das RPCs críticas;
- RLS das tabelas centrais;
- Edge Functions essenciais ativas;
- integrações de Kanban, Recruiting, Contribution Passport, atividade e permissões;
- commits mais recentes de endurecimento de autorização.

### Resultado

A arquitetura de benefícios e permissões está consistente com a divisão FREE / PRO / ELITE e com a matriz Owner / Maintainer / Developer / Reviewer / Designer / Member / Viewer.

## 14. Regras para novas funcionalidades

Ao adicionar um recurso novo ao DevHub:

1. definir o entitlement do plano;
2. definir a capability da função;
3. aplicar a validação no backend;
4. aplicar RLS/RPC quando houver dado sensível;
5. refletir a permissão na interface;
6. testar Owner, Maintainer e pelo menos uma função restrita;
7. testar acesso anônimo;
8. documentar o comportamento neste guia.

## 15. Checklist de regressão

Antes de publicar mudanças no DevHub, verificar:

- FREE não ultrapassa 1 repositório;
- PRO não ultrapassa 5 repositórios;
- ELITE aceita repositórios privados;
- Project Studio é exclusivo ELITE;
- Owner mantém ações destrutivas exclusivas;
- Maintainer não recebe `destructive`;
- Developer não recebe merge/admin;
- Reviewer não recebe escrita de código;
- Viewer permanece somente leitura;
- usuário anônimo não executa RPCs administrativas;
- projeto privado não vaza dados por SELECT/RPC;
- interface acompanha exatamente as capacidades do backend.

---

Este documento deve ser atualizado sempre que a matriz de planos, funções, RPCs ou integrações do DevHub mudar.
