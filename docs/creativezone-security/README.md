# CreativeZone Security

O **CreativeZone Security** é a camada de auditoria de dependências e projetos da CreativeZone.

O sistema combina análise de pacotes/versionamento, auditoria automática de repositórios GitHub, histórico de postura de segurança, cards de análise em tópicos/respostas e exibição de projetos auditados em perfis técnicos.

## Objetivos

- identificar vulnerabilidades conhecidas em versões específicas de dependências;
- analisar automaticamente os projetos que possuem repositório GitHub;
- detectar manifests e lockfiles;
- reutilizar o inventário de dependências do GitHub quando disponível;
- manter histórico de auditorias por projeto;
- atualizar periodicamente a postura de segurança;
- exibir resultados no fórum sem exigir que o usuário entenda a infraestrutura;
- deixar claro que ausência de vulnerabilidades conhecidas não é garantia absoluta de segurança.

## Arquitetura

```text
CreativeZone React
      |
      +--> pacote manual no Editor
      |       |
      |       v
      |   security-audit Edge Function
      |       |
      |       +--> cache de pacote
      |       +--> OSV batch query
      |       +--> detalhes das vulnerabilidades
      |
      +--> Projeto com repo_url GitHub
              |
              v
         security-audit
              |
              +--> GitHub repo metadata
              +--> GitHub dependency/SBOM quando disponível
              +--> árvore de manifests como fallback
              +--> parser de lockfiles/manifests
              +--> OSV batch query
              |
              v
       project_security_audits
              |
              v
        project_security_state
              |
              +--> página do projeto
              +--> cards de projetos
              +--> perfil técnico
```

## Componentes

- `supabase/functions/security-audit/index.ts` — motor de auditoria;
- `public.security_package_cache` — cache curto de pacote + versão;
- `public.project_security_audits` — histórico imutável das auditorias;
- `public.project_security_state` — estado atual de cada projeto;
- `src/services/securityApi.js` — cliente frontend;
- `src/SecurityAudit.jsx` — cards/painéis;
- `src/ProfessionalEditor.jsx` — inserção de análise de dependência;
- `src/ExtendedCommunityPages.jsx` — auditoria dos projetos;
- `src/CommunityPages.jsx` — projetos auditados no perfil técnico.

## Fluxo de pacote manual

O editor insere um token interno:

```
[security:<ecosystem>:<package>:<version>]
```

Os valores são URL-encoded pelo frontend.

Na renderização, o token vira um `PackageSecurityCard`. O card consulta o gateway `security-audit`, que:

1. normaliza ecossistema/pacote/versão;
2. consulta o cache de 6 horas;
3. se necessário, consulta as vulnerabilidades;
4. deduplica aliases (CVE/GHSA/identificadores equivalentes);
5. resume severidade;
6. encontra versões corrigidas quando presentes;
7. calcula o Security Score da CreativeZone;
8. retorna os dados necessários para o card.

## Ecossistemas

A interface está preparada para:

- npm;
- PyPI;
- Go;
- crates.io;
- Maven;
- NuGet;
- RubyGems;
- Packagist;
- Pub;
- GitHub Actions.

## Auditoria GitHub

A auditoria aceita `repo_url` no formato:

```
https://github.com/owner/repository
```

Para projetos públicos, tenta obter o inventário completo de dependências disponibilizado pelo GitHub. Caso ele não esteja disponível, utiliza leitura direta de manifests/lockfiles.

### Manifests e lockfiles detectados

- package.json;
- package-lock.json;
- npm-shrinkwrap.json;
- pnpm-lock.yaml;
- yarn.lock;
- requirements*.txt;
- Pipfile.lock;
- poetry.lock;
- pyproject.toml (detecção);
- go.mod/go.sum (detecção + go.sum);
- Cargo.toml/Cargo.lock (detecção + Cargo.lock);
- composer.json/composer.lock;
- Gemfile/Gemfile.lock;
- packages.lock.json;
- packages.config;
- pom.xml;
- gradle.lockfile;
- pubspec.yaml/pubspec.lock;
- *.csproj / *.fsproj / *.vbproj (detecção);
- .github/workflows/*.yml e *.yaml.

Lockfiles são preferidos para análise porque representam versões concretas. Manifests sem versões exatas não devem gerar uma falsa precisão.

## Atualização automática

Existe um job `pg_cron`:

`creativezone-security-project-audits`

Ele roda a cada 6 horas e envia projetos elegíveis para a Edge Function.

Cada projeto possui `next_scan_at`; o intervalo padrão entre auditorias concluídas é 12 horas. Portanto o cron funciona como despachante e somente projetos vencidos são realmente reanalisados.

Ao trocar `repo_url`, o motor detecta que o repositório mudou e não reutiliza indevidamente o estado anterior.

## Git commit

O estado registra o SHA real da árvore Git auditada em `repo_commit_sha`. Isso permite saber exatamente qual estado do repositório foi usado na auditoria.

## Score

O Security Score é uma métrica própria da CreativeZone, de 0 a 100.

Penalidades atuais:

- crítica: 30;
- alta: 18;
- moderada: 8;
- baixa: 3;
- sem classificação: 5.

O score nunca deve ser apresentado como certificação de segurança. Ele resume apenas vulnerabilidades conhecidas encontradas nas dependências observadas.

## Estados do projeto

- `unknown` — ainda não auditado;
- `scanning` — análise em andamento;
- `secure` — nenhuma vulnerabilidade conhecida encontrada;
- `attention` — existem alertas de menor impacto;
- `danger` — alerta alto/crítico ou score baixo;
- `error` — auditoria não pôde ser concluída.

## Perfil técnico

O RPC `get_profile_audited_projects` retorna projetos públicos em que o membro é:

- owner;
- membro ativo.

A página pública mostra:

- nome do projeto;
- relação do membro;
- dependências analisadas;
- quantidade de alertas;
- Security Score;
- severidade mais alta.

Projetos privados/member-only não são expostos no perfil público.

## Privacidade e permissões

- cache interno de pacotes não é lido diretamente pelo frontend;
- histórico/estado de projeto público pode ser exibido publicamente;
- projetos restritos são visíveis somente aos participantes autorizados;
- reanálise manual exige owner, maintainer, moderator ou admin;
- a Edge Function usa service role somente no backend;
- o frontend nunca recebe a service role;
- a auditoria atual de repositório automático trabalha com repositórios GitHub públicos.

Para repositórios privados, a evolução correta é uma GitHub App com permissões mínimas e instalação explícita por organização/repositório. Não armazenar provider tokens de login social como solução improvisada.

## Rate limits e resiliência

Mesmo que o serviço de vulnerabilidades permita alto volume, a CreativeZone utiliza:

- cache de pacote;
- batch queries;
- limite por cache miss público;
- limite de dependências por auditoria;
- limite de findings armazenados;
- concorrência limitada para detalhes;
- número limitado de projetos por execução agendada;
- retry posterior em falhas.

Se a análise externa ficar indisponível, fórum, tópicos e projetos continuam carregando. A auditoria é uma camada adicional, não uma dependência para navegar na comunidade.

## Testes reais atuais

A integração foi validada com:

- `PyPI / jinja2 / 2.4.1` — retorna vulnerabilidades conhecidas;
- `PyPI / jinja2 / 3.1.6` — sem vulnerabilidades conhecidas no teste atual;
- projeto oficial `Forum-CreativeZone/CreativeZone` — leitura automática do GitHub e manifests.

## Laboratório do Fórum

O tópico oficial está em:

**Laboratório do Fórum → Tecnologias & Integrações**

Título:

**CreativeZone Security — Auditoria automática de projetos e dependências**

Ele contém cards reais de análise, não imagens estáticas.

## Evolução segura

Antes de ampliar o motor:

1. manter os parsers determinísticos;
2. preferir lockfiles a ranges de versão;
3. adicionar novos ecossistemas somente quando houver mapeamento confiável;
4. não confundir análise de dependências com antivírus;
5. não bloquear conteúdo automaticamente com base apenas no score;
6. preservar histórico para auditoria;
7. adicionar GitHub App antes de suportar repositórios privados;
8. continuar tratando todo dado vindo de repositórios como entrada não confiável.
