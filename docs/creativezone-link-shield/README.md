# CreativeZone Link Shield

> Camada universal de proteção de URLs externas da CreativeZone.\n\n**Tutorial no fórum:** https://forum.creativezone.pro/topico/creativezone-link-shield-protecao-inteligente-de-links--d47f4fe0-9ca7-4bf0-b639-33738393c727

## Objetivo

O Link Shield verifica a reputação de links **antes** de o CreativeZone Link Preview visitar o endereço e antes de um clique externo continuar quando houver risco conhecido.

A proteção essencial é **FREE para toda a comunidade**. Recursos premium futuros devem monetizar gestão, histórico e automação — nunca a proteção básica.

## Arquitetura

```text
URL publicada ou clicada
        |
        v
normalização e privacidade
        |
        v
CreativeZone Link Shield
        |
        +--> cache de reputação
        +--> regras locais
        +--> URLhaus / abuse.ch
        +--> providers futuros
        |
        v
allow / warn / block
        |
        +--> allow: Link Preview / navegação
        +--> warn: aviso ao usuário
        +--> block: intersticial de risco + preview remoto bloqueado
```

## URLhaus

O primeiro provider externo é **URLhaus / abuse.ch**.

O backend utiliza lookup exato de URL. A credencial fica somente nos Secrets das Edge Functions:

```text
URLHAUS_AUTH_KEY
```

O código também reconhece `ABUSECH_AUTH_KEY` como nome alternativo de compatibilidade.

Sem uma Auth-Key configurada, o Link Shield continua aplicando as proteções locais e funciona em modo degradado, mas não pode consultar a reputação URLhaus.

## Decisões

### allow

Nenhuma ameaça conhecida foi encontrada pela fonte consultada, ou o provider está temporariamente indisponível e o sistema entrou em fail-open.

Uma resposta sem correspondência **não significa garantia absoluta de segurança**.

### warn

Usado quando a CreativeZone detecta situações que merecem decisão explícita do usuário, como:

- endereço local/reservado;
- URL contendo token, assinatura ou credencial aparente.

### block

Usado quando uma fonte de inteligência de ameaças configurada retorna correspondência positiva para a URL.

O usuário recebe um aviso forte. O Link Preview não visita o destino.

## Privacidade

URLs com parâmetros que aparentam conter credenciais ou assinaturas não são enviadas para providers externos.

O frontend também ignora links internos e URLs assinadas do Supabase Storage.

Nunca enviar a provedores:

- JWTs;
- cookies;
- Authorization;
- URLs privadas internas;
- links assinados do Storage;
- segredos.

## Integração com Link Preview

O `link-preview` consulta o Link Shield **antes de consultar o próprio cache de preview**.

Isso é intencional: uma página que era legítima quando o preview foi gerado pode adquirir reputação maliciosa depois.

Se a decisão for `warn` ou `block`:

1. nenhum GET é feito no site remoto pelo Preview;
2. imagens/logos remotos não são carregados;
3. a interface exibe um card do Link Shield;
4. o clique continua protegido pelo intersticial global.

## Proteção no frontend

`LinkShieldGuard` intercepta cliques em links HTTP/HTTPS externos.

- `allow`: navegação normal;
- `warn`: abre aviso;
- `block`: abre alerta forte;
- o usuário pode voltar em segurança, denunciar ou prosseguir conscientemente.

`LinkShieldGate` protege conteúdo remoto antes de carregá-lo, incluindo:

- YouTube;
- CodePen;
- imagens externas incorporadas;
- imagens Markdown do editor.

Links normais, cards de repositório e cards de preview são cobertos pelo guard global.

## Banco de dados

### `link_shield_cache`

Cache de reputação por URL, com TTL próprio.

### `link_shield_events`

Auditoria de decisões relevantes, principalmente `warn` e `block`.

### `link_shield_reports`

Denúncias de URLs suspeitas enviadas por membros autenticados.

As três tabelas são protegidas por RLS e ficam acessíveis diretamente apenas ao backend/service role.

## Multi-provider

O resultado armazena detalhes em `providers JSONB`. Isso permite adicionar sem quebrar o frontend:

- Google Web Risk;
- ThreatFox;
- reputação de IP;
- outros providers compatíveis com os termos da CreativeZone.

## Planos

### FREE — proteção para todos

- verificação automática;
- alertas e bloqueios;
- proteção do Link Preview;
- proteção de links externos;
- proteção de embeds/imagens;
- denúncia de URL suspeita.

### PRO — futuro

- histórico de links por projeto;
- rechecagem programada;
- análise em lote;
- analytics de domínios;
- alerta de mudança de reputação;
- exportação básica.

### ELITE — futuro

- políticas por equipe;
- allowlist/denylist avançadas;
- correlação de múltiplos providers;
- webhooks;
- API;
- quarentena e automações avançadas;
- integrações com workflows de projetos privados.

## Falhas de provider

A indisponibilidade de um provider não derruba o fórum.

```text
provider disponível -> decisão normal
provider indisponível -> unknown / allow + protected=false
```

Isso evita bloquear toda a comunidade por indisponibilidade externa.

As proteções locais continuam ativas.

## Arquivos

- `src/services/linkShieldApi.js`;
- `src/services/linkShieldApi.test.js`;
- `src/LinkShieldGuard.jsx`;
- `src/LinkShield.css`;
- `supabase/functions/link-shield/index.ts`;
- `supabase/functions/link-preview/index.ts`;
- `supabase/migrations/20261015210949_creativezone_link_shield_v1.sql`.

## Regra de produto

> Segurança essencial não é benefício premium.

PRO e ELITE podem oferecer inteligência, produtividade e automação adicionais, mas um membro FREE recebe a mesma barreira básica contra links reconhecidos como perigosos.


## Homologação URLhaus

Homologado em **15/10/2026** com o provider URLhaus ativo em produção.

Testes realizados:

- health check da Edge Function: `urlhaus.configured=true`;
- URL legítima conhecida: `no_known_threat / allow / risk 0`;
- URL presente no URLhaus: `malicious / block / risk 100`;
- integração Link Shield → Link Preview: preview bloqueado antes de qualquer fetch remoto;
- nenhuma entrada de preview foi criada para a URL maliciosa;
- cache e evento de segurança foram persistidos corretamente.

A homologação do caso malicioso usa apenas consulta de reputação ao URLhaus. O destino malicioso não é visitado pela CreativeZone.
