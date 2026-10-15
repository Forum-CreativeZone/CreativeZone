<p align="center">
  <img src="./assets/banner.png" alt="CreativeZone — Comunidade Creative Lab" width="100%" />
</p>

<h1 align="center">CreativeZone</h1>

<p align="center">
  <strong>Comunidade, fórum e workspace colaborativo para transformar ideias em projetos reais.</strong>
</p>

<p align="center">
  <a href="https://forum.creativezone.pro/">🌐 Fórum</a>
  ·
  <a href="https://github.com/Creatiive-Zone">🐙 Organização GitHub</a>
  ·
  <a href="./docs/CREATIVEZONE_DEVHUB_GUIA_COMPLETO.md">📘 Guia do DevHub</a>
</p>

---

## Sobre

A **CreativeZone** reúne comunidade, colaboração e desenvolvimento em uma única plataforma. Além do fórum tradicional, membros podem criar projetos, formar equipes, conectar repositórios GitHub e trabalhar com ferramentas de desenvolvimento sem sair do site.

### Principais áreas

- **Fórum e comunidade:** categorias, tópicos, respostas, reações, perfis, reputação, mensagens e chat em tempo real.
- **CreativeZone DevHub:** repositório real, README estilo GitHub, Code Studio com Monaco Editor, terminal com xterm.js, Issues, Pull Requests, Actions, Kanban e equipes.
- **CreativeZone Security:** análise de dependências, OSV, Security Score, histórico de auditorias e automações por plano.\n- **CreativeZone Link Shield:** proteção preventiva e reputação de links externos para toda a comunidade.
- **CreativeZone Moderation:** denúncias, triagem assistida e decisões humanas na Central de Moderação.
- **Projetos colaborativos:** Activity Feed, Project Passport, Contribution Passport, Recruiting, Mentors, Team Chat e Learning.
- **Contas e notificações:** login por e-mail, Google e GitHub, notificações em tempo real, e-mail e Web Push.

---

## 🚀 CreativeZone DevHub

O DevHub usa o **GitHub como fonte real**. Arquivos, branches, commits, Issues, Pull Requests, releases e Actions exibidos no projeto vêm do repositório conectado.

Entre os recursos disponíveis:

- README renderizado como no GitHub;
- navegação real de arquivos e pastas;
- **Monaco Editor** no Code Studio;
- **xterm.js** com terminal Git seguro;
- execução isolada de código via **Judge0 CE**;
- branch → commit → Pull Request → review → merge;
- CI Cockpit com GitHub Actions;
- Kanban em tempo real;
- Activity Feed;
- Project Passport e Contribution Passport;
- Recruiting / “Preciso de ajuda”;
- funções Owner, Maintainer, Developer, Reviewer, Designer, Member e Viewer;
- equipes privadas ELITE;
- OSV, Security Score, Security Gate e AutoFix conforme o plano.

### Planos

| Plano | DevHub |
|---|---|
| **FREE** | 1 repositório, dados básicos, README e OSV básico |
| **PRO** | até 5 repositórios, Issues, PRs, Actions, histórico, SBOM, dependências e OSV completo |
| **ELITE** | repositórios ilimitados e privados, Project Studio, commits pelo fórum, CI Cockpit, Security Gate, scans push/PR e AutoFix |

A validação de plano e função acontece no **backend**, não apenas na interface.

📘 [Documentação técnica e funcional completa](./docs/CREATIVEZONE_DEVHUB_GUIA_COMPLETO.md)

📚 [Índice geral da documentação](./docs/README.md)

🧭 [Tutorial passo a passo no fórum](https://forum.creativezone.pro/topico/creativezone-github-devhub-organizacao-oficial-projetos-colaborativos--669c591f-a72d-469d-86bf-17d4cc8d06d3)

---

## 🛡 CreativeZone Security

Projetos GitHub podem ser auditados automaticamente. O scanner detecta manifests/lockfiles, identifica dependências e consulta vulnerabilidades conhecidas no **OSV**.

O sistema mantém:

- Security Score;
- dependências detectadas;
- vulnerabilidades e severidades;
- histórico de auditorias;
- scans automáticos conforme o plano;
- proteção por RLS e permissões de projeto.

Documentação específica: [CreativeZone Security](./docs/creativezone-security/README.md).\n\nProteção de URLs: [CreativeZone Link Shield](./docs/creativezone-link-shield/README.md).

Moderação: [CreativeZone Moderation Assist](./docs/creativezone-moderation/README.md).

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React + Vite |
| Backend | Supabase |
| Banco | PostgreSQL |
| Auth / Realtime | Supabase Auth + Realtime |
| DevHub | GitHub REST/GraphQL + GitHub App |
| Editor | Monaco Editor |
| Terminal | xterm.js |
| Code Runner | Judge0 CE |
| Segurança | OSV + RLS + RPCs |
| E-mail | Resend |
| Hospedagem | Cloudflare Workers Static Assets |
| CI | GitHub Actions + Playwright |

---

## Executar localmente

```bash
git clone https://github.com/Forum-CreativeZone/CreativeZone.git
cd CreativeZone
npm ci
npm run dev
```

Crie `.env.local`:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxx
```

Nunca exponha `service_role`, chaves privadas do GitHub App, Resend ou outros segredos em variáveis `VITE_*`.

### Verificações

```bash
npm run lint
npm run test:unit
npm run test:e2e
npm run check:migrations
npm run check:devhub-plans
npm run build
```

O workflow **Quality & Build** executa lint, testes, migrations, auditoria de gates FREE/PRO/ELITE, build e smoke tests Playwright.

---

## Estrutura

```text
CreativeZone/
├── assets/
├── docs/
│   └── CREATIVEZONE_DEVHUB_GUIA_COMPLETO.md
├── public/
├── src/
├── supabase/
│   ├── functions/
│   └── migrations/
├── tests/e2e/
└── package.json
```

---

## Produção

**Fórum:** https://forum.creativezone.pro/

**Organização GitHub:** https://github.com/Creatiive-Zone

O projeto usa migrations versionadas, Edge Functions e políticas RLS. Mudanças de permissões, planos ou integrações do DevHub devem atualizar também o guia técnico e os testes de regressão.

---

<p align="center">
  <strong>CreativeZone</strong><br/>
  Ideias. Tecnologia. Comunidade. Projetos construídos juntos.
</p>
