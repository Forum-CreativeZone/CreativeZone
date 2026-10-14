# CreativeZone DevHub

O DevHub conecta Projetos CreativeZone ao GitHub por GitHub App, GitHub REST/GraphQL, webhooks assinados, Supabase e CreativeZone Security/OSV.

## Fluxo
Projeto -> GitHub App -> REST/GraphQL -> card/repository intelligence -> SBOM/manifests -> OSV.dev -> histórico e segurança.

## Edge Functions
- `github-api`: REST/GraphQL, repository card, deps.dev e OpenSSF Scorecard.
- `github-webhook`: HMAC SHA-256, eventos e sincronização em background.
- `github-security-scan`: SBOM, manifests, OSV e regras FREE/PRO/ELITE.
- `security-audit`: consulta OSV pública por pacote usada pelos embeds existentes.

## FREE
- 1 repositório público por projeto
- reconhecimento e GitHub Card
- linguagem, stars, forks, README e última release
- OSV básico e status público de vulnerabilidades

## PRO
Tudo do FREE + até 5 repositórios, scan completo ao conectar, SBOM, dependências diretas/transitivas, OSV completo, deps.dev, histórico, reanálise periódica, commits, issues, PRs, Actions, linguagens/release history e Project Health/OpenSSF.

## ELITE
Tudo do PRO + repositórios privados/ilimitados, scans em push e PR, alertas em tempo real, Security Gate, AutoFix assistido, Project Studio, commits pelo fórum, branch/PR workflow e cockpit CI/CD.

Credenciais do GitHub App permanecem em Supabase Secrets; private key e installation tokens nunca são enviados ao frontend.


## Operational workspace v2

CreativeZone is the primary user interface; GitHub is the version-control and collaboration infrastructure behind it.

### Account linking

A forum account authenticated by e-mail or Google can link a GitHub identity independently through Supabase Auth identity linking. The provider token is captured server-side and stored in a private service-role-only credential store. Public profile metadata lives in `github_connections`; raw OAuth credentials are never exposed through public tables.

### Repository onboarding

A CreativeZone project can:

- create a repository in the linked member's GitHub account;
- create a repository in the `Creatiive-Zone` organization when membership allows it;
- connect an existing repository;
- request organization membership from inside the forum when necessary.

The project and repository are linked in both the forum project record and DevHub repository tables.

### Dev Workspace

The operational workspace supports:

- repository tree and file reading;
- create/edit/upload/delete file operations;
- work branches and commits;
- Issues and Issue discussions;
- Pull Requests, reviews and merge;
- GitHub Actions/CI status;
- OSV/dependency security and assisted fixes;
- supported repository settings;
- safe Git terminal commands backed by GitHub APIs;
- Judge0 CE sandboxed code execution.

GitHub links remain only as explicit secondary fallbacks.

### Authorization model

CreativeZone project roles are mapped to workspace capabilities:

- owner: project/repository management;
- maintainer: management and merge;
- contributor: code/branch/commit/Issue/PR workflow;
- non-member: read-only public project surfaces only.

For repository access the backend prefers the CreativeZone GitHub App installation token. When an App installation is not available, the linked user's GitHub OAuth credential may be used after verifying write permission.

### Organization membership

Organization requests originate inside CreativeZone and generate forum/email notifications. Approval attempts to send the GitHub organization invitation through the CreativeZone DevHub GitHub App. This requires the App to be installed on `Creatiive-Zone` with **Organization members: read/write** permission.
