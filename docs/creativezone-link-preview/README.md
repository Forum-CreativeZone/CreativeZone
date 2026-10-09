# CreativeZone Link Preview

> Motor próprio de previews de links da CreativeZone, extraído conceitualmente do ecossistema open source da Microlink HQ e implementado para funcionar sem assinatura mensal da Microlink Cloud.

## Origem e atribuição

A arquitetura deste módulo foi estudada a partir dos projetos open source mantidos pela **Microlink HQ**, principalmente:

- **metascraper** — https://github.com/microlinkhq/metascraper
- **browserless** — https://github.com/microlinkhq/browserless
- **microlink.io client** — https://github.com/microlinkhq/microlink

O `metascraper` descreve a mesma ideia central utilizada aqui: receber uma URL + HTML e normalizar metadata de Open Graph, Twitter Cards, JSON-LD, Microdata, RDFa e HTML. O `browserless` fornece a camada de Chromium/Puppeteer necessária quando o HTML simples não é suficiente.

**Importante:** a versão atual do CreativeZone Link Preview é uma implementação própria escrita para a CreativeZone. Não copiamos a infraestrutura proprietária da Microlink Cloud e não dependemos do endpoint pago da Microlink.

Os projetos `metascraper` e `browserless` estão sob licença MIT. Caso código ou pacotes desses projetos sejam incorporados diretamente no futuro, os avisos de copyright e licença MIT do upstream devem ser preservados:

> Copyright © 2019 Microlink <hello@microlink.io> (microlink.io)

A licença upstream permite uso, cópia, modificação, distribuição, sublicenciamento e uso comercial, desde que o aviso de copyright/licença seja mantido nas cópias ou porções substanciais.

Os avisos de terceiros estão registrados em [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

---

## Objetivo

Transformar uma URL comum em um card rico e consistente com a CreativeZone:

- título;
- descrição;
- imagem de destaque;
- favicon/logo;
- publisher/site;
- autor;
- data;
- idioma;
- domínio;
- URL canônica.

O usuário apenas cola um link. A CreativeZone resolve e renderiza o preview automaticamente.

A API externa da Microlink **não é necessária** para esta primeira camada.

---

## Onde está ativo

### Tópicos e respostas

Uma URL HTTP/HTTPS colocada sozinha em uma linha é convertida em preview rico.

A ordem de renderização é:

1. YouTube → embed nativo já existente;
2. CodePen → embed nativo já existente;
3. imagem direta → imagem nativa;
4. GitHub → card especializado atual, até a futura integração GitHub API;
5. qualquer outro link → **CreativeZone Link Preview**;
6. se o preview falhar → link simples/seguro continua funcional.

Links Markdown como `[texto](https://...)` continuam sendo hyperlinks normais. Isso dá ao autor uma forma simples de evitar o card quando não quiser incorporação.

### Editor profissional

A aba **Pré-visualizar** usa o mesmo renderer dos tópicos. Portanto o autor vê o card antes de publicar.

### Chat da Comunidade

A primeira URL de cada mensagem pode gerar um card compacto. Limitamos a um preview por mensagem para impedir que vários links ocupem o chat inteiro.

### Projetos

O campo `website_url` dos projetos recebe um card de apresentação próprio na página do projeto.

O `repo_url` continua separado porque será enriquecido pela futura integração oficial com a API do GitHub.

### Perfis

Não está ativado nos perfis nesta primeira fase. Isso é intencional para não poluir visualmente a área pública. Pode ser habilitado futuramente para Website/Portfólio.

---

## Arquitetura atual

```text
React / CreativeZone
        |
        | supabase.functions.invoke("link-preview")
        v
Supabase Edge Function
        |
        +--> normalização da URL
        +--> proteção SSRF / rede privada
        +--> consulta ao cache
        |
        +--> cache válido? ---- sim ----> retorno
        |
        v
HTTP GET do site público
        |
        +--> Open Graph
        +--> Twitter Cards
        +--> meta HTML
        +--> JSON-LD
        +--> canonical
        +--> favicon
        v
normalização dos campos
        |
        v
link_preview_cache (Supabase)
        |
        v
card responsivo CreativeZone
```

### Arquivos

- `src/LinkPreview.jsx` — componente visual;
- `src/services/linkPreviewApi.js` — cliente e deduplicação em memória;
- `supabase/functions/link-preview/index.ts` — extractor/gateway;
- `public.link_preview_cache` — cache persistente;
- `src/ProfessionalEditor.jsx` — tópicos, respostas e preview do editor;
- `src/CommunityChat.jsx` — preview compacto no chat;
- `src/ExtendedCommunityPages.jsx` — website dos projetos.

---

## Cache

O cache próprio é parte central do projeto.

### TTL atual

- preview completo: **7 dias**;
- preview mínimo: **24 horas**;
- falha: **2 horas**.

Isso significa que milhares de visualizações da mesma URL não geram milhares de acessos externos.

Também existe cache em memória no frontend para deduplicar chamadas durante a mesma sessão.

### Normalização

Antes de buscar uma URL removemos fragmentos e parâmetros comuns de tracking, por exemplo:

- `utm_*`;
- `fbclid`;
- `gclid`;
- `msclkid`;
- `mc_cid`;
- `mc_eid`.

Os parâmetros restantes são ordenados para aumentar a taxa de reaproveitamento do cache.

---

## Segurança atual

O serviço foi criado como endpoint público porque visitantes não autenticados também precisam visualizar cards em tópicos públicos.

Por isso ele aplica restrições antes de qualquer fetch.

### Proteções

- somente `http:` e `https:`;
- remove username/password embutidos na URL;
- bloqueia `localhost`;
- bloqueia hosts `.local` e `.internal`;
- bloqueia IPv4/IPv6 privados, loopback, link-local e faixas reservadas;
- valida DNS antes de acessar o destino;
- revalida cada redirect;
- máximo de redirects;
- timeout de rede;
- limite máximo de HTML;
- aceita somente HTML/XHTML para extração;
- não encaminha cookies do usuário;
- não encaminha Authorization da CreativeZone;
- não executa JavaScript da página;
- não injeta HTML remoto no React;
- metadados são renderizados como valores React;
- imagens usam `referrerPolicy="no-referrer"`;
- rate limit de cache misses por instância da Edge Function;
- cache é acessível diretamente apenas pelo backend/service role.

Quando o **CreativeZone Link Shield** for implementado, a cadeia poderá ficar:

```text
URL
 |
 v
Link Shield / reputação
 |
 v
Link Preview
```

---

## Limitações da fase Edge

A Edge Function atual faz HTTP normal. Portanto funciona muito bem em páginas que publicam metadata no HTML inicial, como a maioria de:

- documentação;
- blogs;
- notícias;
- sites institucionais;
- produtos;
- portfólios;
- landing pages;
- sites com Open Graph/JSON-LD.

Pode retornar apenas um fallback para páginas que:

- dependem de JavaScript para gerar metadata;
- exigem login;
- usam proteção anti-bot agressiva;
- restringem datacenters;
- não publicam metadata;
- servem conteúdo apenas após interação.

Isso não é tratado como erro do fórum. A URL permanece clicável.

---

# Roadmap: transformar em uma plataforma self-hosted no nível da Microlink

O objetivo futuro é manter a mesma API interna da CreativeZone e trocar apenas o motor.

Quando houver uma VPS, o frontend **não precisará ser reescrito**.

## Arquitetura futura

```text
CreativeZone React
        |
        v
Supabase Edge Function / Gateway
        |
        +--> cache Supabase
        |
        v
CreativeZone Preview Engine (VPS)
        |
        +--> Node.js
        +--> metascraper
        +--> html-get
        +--> browserless
        +--> Puppeteer / Chromium
        +--> fila de jobs
        +--> Redis
        +--> Storage
        |
        v
Internet pública
```

A Edge Function continua sendo o gateway de segurança e cache. Só envia para a VPS o que realmente precisa de navegador.

---

## Fase VPS 1 — HTML renderizado por Chromium

Instalar em um serviço Node isolado:

- Node.js LTS;
- `metascraper`;
- `metascraper-title`;
- `metascraper-description`;
- `metascraper-image`;
- `metascraper-logo`;
- `metascraper-publisher`;
- `metascraper-author`;
- `metascraper-date`;
- `metascraper-url`;
- `metascraper-lang`;
- `html-get`;
- `browserless`;
- `puppeteer` ou `puppeteer-core`;
- Chromium.

O fluxo passa a ser:

```text
fetch HTTP simples
  |
  +-- metadata suficiente --> retorna
  |
  +-- insuficiente
        |
        v
Chromium headless
        |
        v
HTML renderizado
        |
        v
metascraper
```

Assim o Chromium é usado somente quando necessário.

---

## Fase VPS 2 — pool de browser

Nunca abrir um processo Chrome inteiro para cada URL.

Manter:

- um ou mais processos Chromium;
- BrowserContexts isolados por job;
- limite de abas simultâneas;
- timeout por página;
- destruição do contexto após cada job;
- bloqueio de downloads;
- bloqueio de permissões;
- sem credenciais da CreativeZone;
- rede de saída controlada.

Configuração inicial razoável para tráfego pequeno:

- 2–4 vCPU;
- 4–8 GB RAM;
- Docker;
- concorrência baixa de browsers.

Escalar horizontalmente quando a fila começar a crescer.

---

## Fase VPS 3 — fila e Redis

Adicionar uma fila para tarefas pesadas:

```text
request
 |
 v
cache
 |
 +-- hit --> resposta
 |
 v
queue
 |
 v
browser worker
 |
 v
cache/storage
```

Redis pode guardar:

- locks por URL;
- jobs em andamento;
- resultados quentes;
- rate limits;
- circuit breakers.

Uma URL nunca deve abrir múltiplos browsers simultaneamente só porque muitos usuários acessaram o mesmo tópico.

---

## Fase VPS 4 — screenshots

Novo produto interno:

`screenshot(url)`

Aplicações na CreativeZone:

- screenshot de website de projeto;
- thumbnail automática;
- histórico de página para moderação;
- preview de portfólio.

Armazenar o resultado em Supabase Storage/S3 e reutilizar.

Não gerar screenshot em toda visualização.

---

## Fase VPS 5 — Markdown / texto / HTML

Produtos internos futuros:

- `metadata(url)`;
- `text(url)`;
- `markdown(url)`;
- `html(url)`.

Usos:

- resumo de fontes;
- pesquisa;
- indexação interna;
- criação assistida de tópicos;
- documentação de projetos.

Não republicar automaticamente artigos completos de terceiros. Respeitar copyright/licenças e armazenar apenas o necessário.

---

## Fase VPS 6 — PDF

Produto interno:

`pdf(url)`

Pode ser útil para:

- documentação de projeto;
- relatórios;
- páginas que o próprio usuário controla;
- registros administrativos.

Executar como job pesado assíncrono.

---

## Fase VPS 7 — embeds e redes sociais

Redes sociais são o ponto onde um fetch HTTP simples mais falha.

A estratégia deve ser por provedor:

1. API/oEmbed oficial quando existir;
2. metadata pública;
3. navegador headless quando permitido;
4. fallback de hyperlink.

Exemplos futuros:

- YouTube → manter integração nativa;
- GitHub → API oficial GitHub;
- CodePen → manter embed atual;
- TikTok → oEmbed/API oficial quando disponível;
- Instagram → mecanismos oficiais disponibilizados pela Meta;
- X/Twitter → mecanismo oficial/oEmbed quando disponível;
- Vimeo → oEmbed;
- Spotify → embed oficial.

A infraestrutura self-hosted não deve ser usada para burlar login, paywall, CAPTCHA, acesso privado ou restrições contratuais de plataformas.

---

## Fase VPS 8 — Lighthouse e tecnologias

Produtos semelhantes aos recursos avançados da Microlink:

- `lighthouse(url)`;
- `technologies(url)`.

Podemos combinar:

- Lighthouse;
- Wappalyzer/open-source detectors;
- headers;
- DOM;
- scripts carregados.

Isso se conecta muito bem aos **Projetos CreativeZone**.

---

## Fase VPS 9 — extração customizada

Criar uma API interna compatível com regras próprias:

```json
{
  "url": "https://site.com",
  "fields": {
    "price": "...",
    "version": "...",
    "release": "..."
  }
}
```

Usar somente em fontes em que a extração seja permitida.

---

## Contrato interno recomendado

Mesmo depois da VPS, manter o frontend chamando apenas:

```text
resolveLinkPreview(url)
```

Resposta estável:

```json
{
  "url": "https://example.com/",
  "domain": "example.com",
  "title": "Título",
  "description": "Descrição",
  "image_url": "https://...",
  "logo_url": "https://...",
  "publisher": "Example",
  "author": null,
  "published_at": null,
  "lang": "pt-BR",
  "status": "ok"
}
```

O motor pode mudar de:

```text
Supabase Edge HTML extractor
```

para:

```text
Edge + metascraper + browserless + Chromium + Redis
```

sem mudar os componentes React.

---

## Produtos que podemos adicionar no futuro

A Microlink Cloud oferece várias ideias que podemos reproduzir com infraestrutura própria e componentes open source:

| Produto CreativeZone | Base técnica |
|---|---|
| metadata | metascraper |
| HTML renderizado | Puppeteer/Chromium |
| screenshot | browserless/Puppeteer |
| PDF | Puppeteer |
| text | DOM/Readability |
| markdown | Readability + conversor HTML→Markdown |
| logo | metascraper + favicon/BIMI |
| embed | oEmbed + adapters por provedor |
| links/images/videos | DOM parser |
| technologies | Wappalyzer/detecção própria |
| Lighthouse | Lighthouse CLI/Node |
| função customizada | worker isolado/sandbox próprio |

Isso elimina a **assinatura da Microlink**, mas não elimina custos de infraestrutura. Quando a VPS entrar, haverá custo da VPS, armazenamento, tráfego e eventualmente serviços de proxy/API oficiais de terceiros.

---

## Requisitos de produção para a futura VPS

Antes de expor um browser headless publicamente:

- autenticação entre Edge Function e VPS;
- segredo rotacionável;
- firewall permitindo chamadas do gateway;
- container não-root;
- limites de CPU/RAM;
- seccomp/AppArmor quando disponível;
- filesystem efêmero;
- sem acesso à rede interna;
- proteção SSRF também na VPS;
- bloqueio de cloud metadata endpoints;
- rate limiting;
- fila;
- máximo de concorrência;
- timeout rígido;
- logs sem tokens/cookies;
- limpeza de BrowserContext;
- atualizações frequentes do Chromium;
- monitoramento de memória;
- circuit breaker;
- backups somente dos dados necessários.

---

## Política de privacidade

Nunca enviar ao motor:

- cookies de sessão do usuário;
- JWT da CreativeZone;
- Authorization;
- links privados do Supabase Storage;
- mensagens privadas;
- URLs de páginas internas protegidas.

O Link Preview deve analisar somente URLs que o usuário decidiu publicar em conteúdo público/compartilhável.

---

## Princípio de fallback

O fórum nunca pode depender do preview para funcionar.

```text
preview completo
      ↓ falhou
preview mínimo
      ↓ falhou
link normal
```

Se Edge Function, DNS, VPS, Chromium ou qualquer provedor externo estiver fora do ar, o tópico e o chat continuam disponíveis.

---

## Status

### Implementado agora

- [x] metadata HTTP sem mensalidade externa;
- [x] Open Graph;
- [x] Twitter Cards;
- [x] JSON-LD;
- [x] meta HTML;
- [x] canonical;
- [x] favicon/logo;
- [x] cache Supabase;
- [x] remoção de tracking;
- [x] SSRF guards;
- [x] redirects validados;
- [x] limite de tamanho;
- [x] timeout;
- [x] rate limit básico;
- [x] tópicos;
- [x] respostas;
- [x] editor preview;
- [x] chat compacto;
- [x] websites de projetos;
- [x] dark/light;
- [x] desktop/mobile.

### Próximas etapas quando houver VPS

- [ ] Node Preview Engine;
- [ ] metascraper;
- [ ] Browserless + Puppeteer;
- [ ] Chromium pool;
- [ ] Redis;
- [ ] fila;
- [ ] screenshots;
- [ ] PDFs;
- [ ] Markdown/text;
- [ ] providers sociais;
- [ ] Lighthouse;
- [ ] technologies;
- [ ] observabilidade e escalabilidade horizontal.

---

## Regra de manutenção

Antes de incorporar uma nova versão de qualquer componente upstream, conferir novamente:

- licença;
- changelog;
- requisitos de runtime;
- dependências;
- vulnerabilidades;
- termos das plataformas que serão acessadas.

O objetivo é ter uma plataforma de preview **da CreativeZone**, aproveitando ideias e software open source legítimo, sem criar dependência obrigatória da Microlink Cloud.
