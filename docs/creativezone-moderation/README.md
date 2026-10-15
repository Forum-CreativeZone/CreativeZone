# CreativeZone Moderation Assist

> Moderação assistida própria da CreativeZone. O sistema ajuda a equipe a encontrar conteúdo que merece revisão, mas **não pune automaticamente usuários**.

## Objetivo

A antiga ideia de depender da Perspective API foi substituída por uma camada própria e extensível.

O CreativeZone Moderation Assist combina sinais determinísticos do próprio fórum com outras fontes internas, como o **CreativeZone Link Shield**, e mantém arquitetura pronta para providers sem prender a plataforma a um único fornecedor.

## O que já existia antes

A CreativeZone já possuía:

- denúncias de tópicos, respostas, perfis, projetos e mensagens do chat;
- fila de denúncias;
- moderação de tópicos;
- exclusão de respostas;
- exclusão de mensagens;
- silenciamento e banimento do chat;
- histórico de ações;
- RLS e RPCs para staff.

O Moderation Assist não substitui isso. Ele adiciona uma **fila preventiva de triagem**.

## Fluxo

```text
conteúdo criado/editado
        |
        v
fila de análise
        |
        v
moderation-assist
        |
        +--> sinais de spam/flood
        +--> repetição/comportamento
        +--> contexto da conta
        +--> URLs encontradas
        |      |
        |      v
        |   Link Shield
        |
        v
risk score 0..100
        |
        +--> allow
        +--> review
        +--> urgent
        |
        v
Central de Moderação
        |
        v
decisão humana
```

## Escopos analisados

Nesta versão:

- tópicos;
- respostas;
- mensagens do Chat da Comunidade.

Criação e edição desses conteúdos dispara análise assíncrona pelo frontend. Triggers do banco também mantêm uma fila de segurança para conteúdos que entrem por outros caminhos.

## Sinais atuais

O motor v1 é propositalmente conservador e determinístico.

Ele pode considerar:

- quantidade de URLs;
- quantidade de menções;
- proporção excessiva de caixa alta;
- repetição extrema de caracteres/pontuação;
- conteúdo recente duplicado do mesmo autor;
- conta muito recente combinada com múltiplos links;
- padrões comuns de spam;
- sinais explícitos de ameaça/assédio;
- reputação de URLs via CreativeZone Link Shield.

Os sinais são usados para **priorização**, não como prova definitiva de violação.

## Risk Score

O resultado usa escala de 0 a 100.

### allow

Risco abaixo do limiar de revisão.

O conteúdo continua normal e não precisa ocupar a fila principal da equipe.

### review

Conteúdo merece revisão humana.

Pode ter sinais como spam, duplicação, comportamento anormal ou URL que requer atenção.

### urgent

Sinal de alta prioridade.

Pode ocorrer, por exemplo, quando uma URL analisada pelo Link Shield recebe decisão `block` ou quando a combinação de sinais chega ao limiar crítico.

## Central de Moderação

A página de moderação agora possui três áreas:

### Denúncias

Fila já existente enviada por membros.

### Assistida

Fila produzida automaticamente pelo Moderation Assist.

Mostra:

- score;
- recomendação;
- autor;
- trecho do conteúdo;
- categorias;
- sinais;
- links arriscados;
- horário da análise;
- versão do analisador.

A equipe pode:

- abrir o conteúdo;
- reanalisar;
- marcar como revisado;
- dispensar o sinal;
- aplicar ações de moderação já existentes.

### Histórico

Registro das decisões tomadas pela equipe.

Revisar ou dispensar uma análise assistida também entra no histórico.

## Banco de dados

### `moderation_assessments`

Resultado atual da análise de cada conteúdo.

Principais campos:

- target_type / target_id;
- author_id;
- content_hash;
- analyzer_version;
- provider;
- risk_score;
- recommendation;
- categories;
- signals;
- review_status;
- reviewed_by;
- review_note.

### `moderation_analysis_queue`

Fila interna criada por triggers.

Estados:

- pending;
- processing;
- done;
- error.

## Edge Function

`moderation-assist`

Ações:

- `status`;
- `analyze_target`;
- `batch`.

A função nunca recebe texto arbitrário para moderar pelo navegador. Ela recebe um tipo + UUID e busca o conteúdo real no banco usando o backend.

Isso reduz abuso e mantém uma única fonte de verdade.

## Privacidade

O painel de análises é restrito a `moderator` e `admin`.

As tabelas de fila não ficam expostas aos clientes.

O motor não envia todo conteúdo para um serviço externo nesta versão.

URLs detectadas podem ser consultadas pelo Link Shield respeitando as proteções de privacidade já existentes.

## Política de produto

Moderação não é benefício de assinatura.

Usuários FREE, PRO e ELITE ficam sujeitos às mesmas regras e recebem a mesma proteção comunitária.

O que pode ser comercializado no futuro são ferramentas privadas de **gestão de comunidade/equipe**, caso a CreativeZone ofereça espaços administráveis por terceiros, e não uma moderação “melhor” para quem paga.

## Arquitetura provider-ready

O schema já separa:

- `provider`;
- `provider_result`;
- `analyzer_version`.

Isso permite adicionar futuramente um classificador sem refazer a Central de Moderação.

A recomendação é manter:

```text
CreativeZone signals
        +
provider semântico opcional
        +
histórico/denúncias
        =
prioridade final
```

Nenhum provider futuro deve receber poder de banir, apagar ou punir automaticamente.

## Arquivos

- `src/services/moderationApi.js`;
- `src/services/extendedApi.js`;
- `src/ExtendedCommunityPages.jsx`;
- `src/services/forumApi.js`;
- `src/services/chatApi.js`;
- `supabase/functions/moderation-assist/index.ts`;
- `supabase/migrations/20261015215951_creativezone_moderation_assist_v1.sql`.

## Estado da v1

- [x] fila no banco;
- [x] triggers para tópicos/respostas/chat;
- [x] análise após criação/edição;
- [x] score e recomendação;
- [x] integração com Link Shield;
- [x] detecção de repetição/flood/spam;
- [x] Central de Moderação com aba Assistida;
- [x] reanálise manual;
- [x] revisão/dispensa;
- [x] ações humanas;
- [x] histórico;
- [x] RLS;
- [x] arquitetura pronta para providers adicionais.

## Princípio

> A máquina prioriza. A equipe decide.

O objetivo é reduzir trabalho repetitivo da moderação sem transformar um score em sentença automática.
