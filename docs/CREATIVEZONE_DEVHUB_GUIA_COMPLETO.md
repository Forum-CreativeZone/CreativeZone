# CreativeZone DevHub — Guia Completo

> **Status:** homologado em 15/10/2026 no repositório `Forum-CreativeZone/CreativeZone` e no Supabase do fórum.

## 1. Objetivo

O CreativeZone DevHub transforma **Projetos** em um workspace integrado ao GitHub. O GitHub permanece como fonte real do repositório; a CreativeZone adiciona comunidade, permissões, colaboração, segurança e ferramentas de desenvolvimento.

A regra central é simples: **a interface nunca é a única barreira de segurança**. Plano, função e acesso ao projeto são validados no backend.

## 2. Recursos homologados

### Repositório e README

- estrutura real de arquivos e pastas;
- branches e commits;
- README renderizado em GitHub Flavored Markdown;
- imagens e links relativos;
- assets de repositórios privados via proxy autenticado;
- releases, linguagens e metadados reais.

### Project Studio — ELITE

- Code Studio com **Monaco Editor**;
- árvore de arquivos;
- edição, criação, upload e exclusão de arquivos;
- commits individuais e em lote;
- criação de branches;
- Issues;
- Pull Requests, reviews e merge conforme permissão;
- CI Cockpit;
- configurações suportadas do repositório;
- preview de arquivos.

### Terminal e execução

O terminal visual usa **xterm.js** e segue a experiência do VS Code. Ele não é um shell irrestrito: comandos Git são mapeados para operações seguras sobre o repositório real.

Comandos suportados incluem:

- `git status`;
- `git branch`;
- `git log`;
- `git pull`;
- `git diff`;
- `git checkout -b <branch>`;
- `git switch -c <branch>`;
- `pwd`;
- `ls`.

A execução de código é separada e usa **Judge0 CE** em sandbox.

### Colaboração

- Project Activity Feed em tempo real;
- Project Passport;
- Contribution Passport;
- Kanban integrado;
- Recruiting / “Preciso de ajuda”;
- Mentors;
- Reputation;
- Team Chat;
- Learning;
- notificações com badge numérico e popup em tempo real.

### GitHub Organization

A integração sincroniza a verdade do GitHub para:

- membros;
- convites;
- solicitações;
- estado da organização;
- GitHub App installations;
- webhooks.

Estado local não deve ser exibido como solicitação real quando o GitHub não possui essa solicitação.

## 3. Planos

### FREE

**Limite:** 1 repositório.

Inclui reconhecimento do repositório, dados básicos, README, última release, OSV básico e status público de segurança.

Não inclui repositório privado, Project Studio, PRs avançados, Actions completas, grafo de dependências ou scans avançados.

### PRO

**Limite:** 5 repositórios.

Inclui tudo do FREE e:

- Issues;
- Pull Requests;
- commits e histórico;
- releases;
- Actions;
- linguagens detalhadas;
- SBOM;
- dependências;
- Dependency Graph;
- OSV completo;
- scan ao conectar;
- rescan agendado;
- Project Health.

Não inclui Project Studio, repositório privado, commits pelo fórum, Security Gate, push/PR scan, alertas em tempo real ou AutoFix.

### ELITE

**Limite:** ilimitado.

Inclui tudo do PRO e:

- repositórios privados;
- Project Studio;
- commits pelo fórum;
- branch → PR workflow;
- CI Cockpit;
- Security Gate;
- push scan;
- Pull Request scan;
- alertas em tempo real;
- AutoFix;
- equipes privadas;
- tópicos privados;
- funções avançadas da equipe.

Os gates são auditados no CI com `npm run check:devhub-plans`.

## 4. Funções do projeto

| Função | Resumo |
|---|---|
| **Owner** | controle total, inclusive ações destrutivas |
| **Maintainer** | administração operacional ampla, sem poderes destrutivos de propriedade |
| **Developer** | código, terminal, execução, Issues, PRs e Kanban; sem merge/admin |
| **Reviewer** | leitura, comentários e review de PR; sem escrita de código |
| **Designer** | escrita apenas em caminhos autorizados; sem terminal |
| **Member** | colaboração comunitária e Kanban permitido/atribuído |
| **Viewer** | somente leitura |

O Owner pode conceder **acesso operacional** sem transferir propriedade. Isso não libera exclusão do projeto, transferência de propriedade ou privilégios destrutivos equivalentes.

## 5. Fluxos principais

### Conectar um repositório

1. Abra **Projetos**.
2. Crie um projeto ou abra um existente.
3. Conecte sua conta GitHub quando solicitado.
4. Escolha criar repositório pessoal, criar na organização ou conectar um existente.
5. O backend valida plano, acesso e GitHub App.
6. O repositório é sincronizado e o README real passa a aparecer.

### Trabalhar no código — ELITE

1. Abra **Código**.
2. Escolha o arquivo na árvore.
3. Edite no Monaco Editor.
4. Use uma branch de trabalho.
5. Revise as alterações.
6. Faça commit.
7. Abra um Pull Request.
8. Aguarde CI/review.
9. Faça merge somente se sua função permitir.

### Terminal — ELITE

1. Abra **Terminal**.
2. Digite `help` para ver comandos aceitos.
3. Use comandos Git seguros.
4. Para executar código, use a área de execução/sandbox, não o terminal.

### Kanban

1. Abra **Projects / Quadro / Kanban**.
2. Crie ou mova cards conforme sua função.
3. Defina responsável, prioridade, labels e prazo.
4. Use comentários/checklist quando permitido.
5. Mudanças ficam registradas no histórico e realtime.

### Recruiting

1. Abra **Recruiting** ou clique em **Preciso de ajuda**.
2. Owner/Maintainer autorizado cria a vaga.
3. Define área, habilidades, vagas, visibilidade e descrição.
4. Membros elegíveis se candidatam.
5. Gestores revisam candidaturas.
6. Notificações e e-mails acompanham o fluxo.

### Security / OSV

1. Conecte um repositório.
2. O sistema detecta manifests/lockfiles.
3. Dependências são identificadas por SBOM ou fallback de manifests.
4. OSV verifica vulnerabilidades.
5. O DevHub registra Security Score, severidades e histórico.
6. PRO recebe análise avançada/agendada.
7. ELITE pode receber scans em push/PR, Security Gate, alertas e AutoFix.

### Alertas de segurança acionáveis

A Edge Function `github-security-scan` cria notificações para o Owner quando um scan push/PR encontra vulnerabilidades e o plano permite alertas em tempo real.

Cada alerta inclui:

- título explícito de alerta de segurança;
- projeto e repositório;
- contagem total, críticas e altas;
- destino `/projetos/{slug}?section=security`;
- deduplicação de alertas idênticos por 30 minutos.

A central de notificações encaminha o clique diretamente para a aba **Security** do projeto. Alertas repetidos antigos foram marcados como lidos, mantendo um alerta não lido para a ocorrência idêntica mais recente.

## 6. Roadmap/áreas da interface

O menu lateral do projeto contém áreas de desenvolvimento e áreas CreativeZone.

### Desenvolvimento

- **Overview:** resumo modular do projeto e repositório real.
- **Code:** arquivos e Code Studio.
- **Issues:** tarefas do GitHub.
- **Pull Requests:** alterações, reviews e merge conforme função.
- **Projects:** Kanban.
- **Team:** membros, convites e permissões.
- **Discussions:** discussões ligadas ao projeto.
- **Releases:** versões reais.
- **Actions:** CI.
- **Security:** postura de segurança.
- **Terminal:** terminal Git seguro.
- **Settings:** configurações permitidas.

### CreativeZone

- **Community:** Recruiting + Activity Feed.
- **Mentors:** Owner/Maintainers que orientam contribuições.
- **Recruiting:** vagas e candidaturas.
- **Reputation:** Project Passport.
- **Team Chat:** acesso às conversas da equipe.
- **Security Score:** estado resumido de segurança.
- **OSV:** análise de vulnerabilidades.
- **Learning:** mapa de tecnologias e habilidades do projeto.

## 7. Backend

### Tabelas centrais

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

As tabelas centrais estão sob RLS.

### Edge Functions

- `github-api`;
- `github-auth`;
- `github-community`;
- `github-security-scan`;
- `github-studio`;
- `github-webhook`;
- `security-audit`;
- `teams-api`.

Notificações por e-mail usam também `send-community-email`.

## 8. Segurança

As RPCs administrativas de permissões, equipes, Kanban e Recruiting não são executáveis por `anon`.

RPCs de escrita que exigem conta autenticada também tiveram `EXECUTE` público revogado. RPCs deliberadamente públicas de leitura — por exemplo Project Passport público e Recruiting público — permanecem públicas apenas quando a função aplica as regras de visibilidade.

Ações destrutivas continuam exclusivas do Owner.

## 9. Homologação final

A homologação final confirmou:

- 7 funções e respectivas capabilities;
- gates FREE / PRO / ELITE;
- RLS nas tabelas centrais;
- RPCs críticas bloqueadas para `anon`;
- Edge Functions implantadas e sincronizadas com a `main`;
- GitHub webhook e scans de segurança;
- desktop/mobile;
- tema escuro/claro;
- lint;
- testes unitários;
- migrations;
- build Vite;
- Playwright.

**Workflow final:** GitHub Actions run `38797590085`.

**Commit homologado:** `653d56cdda652df88cdf0ae1bc0d106759882681`.

O `github-security-scan` foi reforçado com diagnóstico estruturado e retry de persistência. Após o ajuste, os scans de homologação concluíram com **Security Score 100** e **0 vulnerabilidades** no repositório principal.

## 10. Checklist de regressão

Antes de publicar mudanças no DevHub:

1. validar `npm run check:devhub-plans`;
2. validar Owner, Maintainer e uma função restrita;
3. confirmar que `anon` não executa RPCs administrativas;
4. confirmar que projeto/repositório privado não vaza dados;
5. testar desktop e mobile;
6. testar tema claro e escuro;
7. executar lint, testes, migrations, build e Playwright;
8. atualizar este guia quando planos, funções ou integrações mudarem.

## 11. Tutorial para membros

O tutorial público, com linguagem não técnica e uso passo a passo, fica no fórum:

https://forum.creativezone.pro/topico/creativezone-github-devhub-organizacao-oficial-projetos-colaborativos--669c591f-a72d-469d-86bf-17d4cc8d06d3

---

Este documento é a referência técnica/funcional do DevHub. O README deve permanecer resumido e apontar para este guia e para o tutorial do fórum.
