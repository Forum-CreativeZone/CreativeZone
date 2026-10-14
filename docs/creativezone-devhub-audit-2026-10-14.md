# CreativeZone DevHub — auditoria operacional

Data da auditoria: 2026-10-14

## Princípio da arquitetura

O CreativeZone é a interface principal de trabalho. O GitHub permanece como fonte de verdade para repositórios, branches, commits, Issues, Pull Requests, Actions e histórico. As operações de escrita passam por Edge Functions autenticadas, verificações de plano, permissões de projeto e permissões reais do GitHub.

## Camadas auditadas

### Identidade GitHub

- Usuários que entraram por e-mail ou Google podem vincular uma identidade GitHub.
- Tokens OAuth são persistidos em área privada e acessados apenas pelo service role.
- A função get_github_user_credential(uuid) não é mais executável por anon/authenticated.
- Organização CreativeZone usa o login real da identidade conectada para checar membership.

### Repositórios

- FREE: até 1 vínculo DevHub.
- PRO: até 5 vínculos.
- ELITE: ilimitado (repository_limit = -1).
- Repositório privado é rejeitado no backend para FREE/PRO.
- A autorização operacional exige permissão real push, maintain ou admin no GitHub antes do primeiro vínculo de escrita.

### Dev Workspace

A Edge Function github-studio valida o plano do proprietário e a participação no projeto antes de liberar operações.

Capacidades ELITE verificadas no backend:

- project_studio
- forum_commits
- branch_pr_workflow
- ci_cockpit
- auto_fix

Operações implementadas:

- árvore de arquivos/pastas;
- leitura de arquivos texto;
- preview autenticado de PNG, JPG/JPEG, WEBP, GIF, SVG e AVIF;
- criação de arquivo;
- criação lógica de pasta via .gitkeep;
- upload em lote;
- mover/renomear;
- excluir;
- commit;
- branches;
- histórico de commits;
- Issues + comentários + fechar/reabrir;
- Pull Requests + reviews + merge;
- CI/CD Cockpit;
- configurações do repositório;
- CreativeZone Security / AutoFix;
- terminal Git seguro;
- execução de código via Judge0 CE.

### Terminal

O terminal integrado é GitHub-backed. Ele não concede shell arbitrário no servidor CreativeZone.

Comandos auditados:

- help
- pwd
- ls
- git status
- git branch
- git log
- git pull
- git diff
- git checkout -b <branch>
- git switch -c <branch>

O modo Editar no terminal abre o conteúdo do arquivo dentro do painel terminal e grava a alteração por commit GitHub.

Para execução de código existe o Runner Judge0 CE, separado do terminal Git.

### README

O README agora possui duas representações:

1. README.md na árvore do Dev Workspace — editável como código/Markdown;
2. README renderizado na visão do repositório — processado como GitHub Flavored Markdown.

Imagens relativas no README são resolvidas via DevHub, inclusive para repositórios privados autorizados, sem expor token GitHub ao navegador.

## Segurança e planos

### FREE

Servidor/banco:

- repository_recognition
- github_card
- basic_repository_data
- readme_summary
- latest_release
- osv_basic_check
- public_security_status
- limite: 1 repositório
- repositório privado: bloqueado
- Dev Workspace: bloqueado

### PRO

Tudo do FREE mais:

- scan_on_connect
- sbom
- dependency_graph
- osv_full
- deps_dev
- histórico
- scheduled_rescan
- commits recentes
- Issues
- Pull Requests
- Actions
- linguagens detalhadas
- histórico de releases
- Project Health
- limite: 5 repositórios
- repositório privado: bloqueado
- Dev Workspace: bloqueado

### ELITE

Tudo do PRO mais:

- repositórios privados;
- repositórios ilimitados;
- scan em push;
- scan em Pull Request;
- alertas em tempo real;
- Security Gate;
- AutoFix;
- Dev Workspace;
- commits pelo fórum;
- branch/PR workflow;
- CI/CD Cockpit;
- equipes privadas;
- tópicos privados de equipe;
- funções/permissões por membro;
- tópicos com vitrine pública e conteúdo protegido.

## Equipes privadas ELITE

Regra do produto auditada:

- somente ELITE (ou system owner) pode criar uma equipe;
- enquanto o dono mantiver ELITE, a equipe continua operacional;
- se o dono perder ELITE, a equipe entra em modo somente leitura até renovação;
- convidados podem ser FREE, PRO ou ELITE;
- convites são enviados por @username do fórum;
- o convidado recebe notificação interna;
- funções disponíveis: owner, maintainer, developer, reviewer, designer, member, viewer;
- somente owner/system owner gerencia membros e funções;
- system owner CreativeZone sempre possui acesso administrativo.

Tópicos:

- team_only: apenas equipe + system owner podem descobrir/ler;
- public_preview: visitantes veem título/resumo, mas conteúdo interno e respostas ficam em tabela separada com RLS de equipe;
- não há conteúdo privado armazenado na mesma linha pública do preview.

## Notificações

Implementado:

- badge numérico de não lidas no sino;
- badge também na navegação mobile;
- marcar uma notificação individual como lida;
- marcar todas como lidas;
- atualização realtime;
- popup dentro do fórum no login quando existem notificações não lidas;
- tipos de notificação para convites, aceite/recusa, mudança de função e remoção de equipe.

## Organização GitHub

O painel diferencia três coisas:

1. membership real da conta GitHub conectada;
2. pedido criado no próprio CreativeZone;
3. convite realmente pendente no GitHub.

O CreativeZone não deve apresentar um pedido local como se fosse um pedido nativo do GitHub.

A solicitação local antiga do usuário administrador Forum-CreativeZone foi cancelada por ser resíduo do fluxo anterior.

### Permissões externas ainda exigidas no GitHub App

A instalação da organização ainda precisa destas permissões para automação total:

- Organization members: Read and write — verificar convites da organização e enviar convites automaticamente;
- Repository administration: Read and write — criação centralizada/administração de repositórios na organização.

Sem essas permissões, o fórum mantém estado coerente e não registra falsamente um convite como enviado.

## CI de planos

O repositório possui scripts/audit-devhub-plan-gates.mjs.

O CI falha se os gates essenciais desaparecerem do backend:

- limite/private repo em github-auth;
- gates de dados em github-api;
- gates de scans em github-security-scan;
- gates ELITE em github-studio;
- gate ELITE de equipes em teams-api;
- entitlements de equipes versionados nas migrations.

Executado pelo script npm run check:devhub-plans e incorporado ao pipeline npm run ci.

## Advisors Supabase

Após as migrations de equipes foram executados os advisors de Security e Performance.

Correções novas aplicadas:

- índices de FKs de equipes adicionados;
- credencial GitHub RPC restrita a service role;
- tabelas privadas de equipe usam RLS e conteúdo confidencial separado de previews públicos.

Warnings antigos de outras áreas do fórum continuam inventariados separadamente e não foram introduzidos por esta funcionalidade.

## Próxima publicação no fórum

Antes de atualizar o tópico público do DevHub, validar no browser:

1. membership real da organização;
2. README com assets relativos;
3. terminal VS Code-inspired em desktop/mobile;
4. criação de equipe ELITE;
5. convite para membro FREE;
6. tópico team_only;
7. tópico public_preview como visitante;
8. contador/popup de notificações.

Depois desses testes, atualizar o tópico explicando a experiência ponta a ponta, comandos suportados, limites e diferenças de plano.
