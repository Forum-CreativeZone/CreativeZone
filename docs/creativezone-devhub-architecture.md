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
