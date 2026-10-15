# CreativeZone REA Lab

> Engenharia reversa assistida dentro da CreativeZone, construída sobre o projeto open source **REA — Reverse Engineer Anything**.

**Upstream:** https://github.com/morluto/rea  
**Licença upstream:** MIT  
**Status:** fundação + workspace + orquestração implementados; execução profunda aguarda worker isolado.

## Objetivo

O CreativeZone REA Lab transforma engenharia reversa em um fluxo de produto:

```text
Analyze
   ↓
Evidence
   ↓
Behavior Specification
   ↓
Independent Implementation Plan
   ↓
Improved Behavioral Rebuild
   ↓
DevHub / branch / testes / Pull Request
```

A proposta não é copiar código-fonte proprietário.

A proposta é:

1. observar comportamento e estrutura;
2. registrar evidências e limitações;
3. entender como uma funcionalidade trabalha;
4. produzir uma especificação independente;
5. criar uma implementação nova;
6. melhorar arquitetura, UX, performance ou capacidades;
7. validar compatibilidade com testes.

## REA upstream

O REA conecta agentes/CLI a ferramentas de engenharia reversa e retorna conclusões acompanhadas de evidências.

O projeto suporta, entre outros:

- binários nativos;
- JavaScript;
- Electron;
- .NET;
- websites;
- HAR/network captures;
- APK Android;
- WASM;
- SQLite;
- firmware;
- PCAP;
- bytecode EVM;
- Flutter;
- análise de processos e outros artefatos.

REA requer Node.js moderno e, dependendo do alvo, ferramentas adicionais como Ghidra, Hopper, IDA, JADX, Chrome, WABT, TShark, Binwalk/Unblob etc.

## Arquitetura CreativeZone

REA não roda dentro do processo web do fórum e não deve rodar dentro de uma Supabase Edge Function.

A arquitetura adotada é:

```text
CreativeZone React
       |
       v
Supabase Edge Function: rea-lab
       |
       +--> autenticação
       +--> plano/cota
       +--> Link Shield
       +--> criação do job
       +--> histórico
       |
       v
rea_lab_jobs
       |
       v
REA Worker isolado
       |
       +--> Node.js 22+
       +--> rea-agents
       +--> ferramentas por target
       +--> filesystem efêmero
       +--> limites de CPU/RAM
       +--> rede controlada
       |
       v
callback assinado
       |
       v
resultado + evidências + specs
```

### Por que um worker isolado

Artefatos de engenharia reversa podem ser não confiáveis.

O worker não deve possuir:

- credenciais do fórum;
- chave privada do GitHub App;
- secrets do Resend;
- acesso direto ao banco administrativo;
- filesystem compartilhado com produção.

Cada job deve ser executado em ambiente efêmero e limitado.

## Modos

### Analyze

Disponível desde FREE, respeitando tipos de alvo e cota do plano.

Entrega esperada:

- resumo;
- estrutura;
- comportamento observado;
- evidências;
- limitações;
- unknowns.

### Behavior Specification

PRO e ELITE.

Transforma evidências em uma especificação estruturada:

- inputs;
- outputs;
- estados;
- eventos;
- network behavior;
- storage/cache;
- módulos;
- dependências;
- erros;
- casos de borda;
- limitações observadas.

### Improved Behavioral Rebuild

ELITE.

Produz um plano independente:

- comportamento a preservar;
- problemas encontrados;
- melhorias propostas;
- arquitetura nova;
- implementação do zero;
- assets próprios;
- testes de compatibilidade;
- integração futura com DevHub.

## Clean-room / implementação independente

O REA Lab registra provenance para separar:

- **observado** — evidência obtida do alvo;
- **inferido** — conclusão derivada da análise;
- **proposto** — arquitetura/plano criado pela CreativeZone;
- **implementado** — código novo escrito para o projeto.

O objetivo é permitir equivalência funcional quando apropriado sem simplesmente reutilizar código ou assets protegidos.

## Uso responsável

O upstream REA possui um disclaimer próprio de uso responsável.

O CreativeZone segue a mesma linha geral:

- análise legítima;
- segurança;
- malware/incident analysis;
- vulnerabilidades;
- interoperabilidade;
- preservação;
- debugging;
- educação;
- pesquisa autorizada.

Não é uma ferramenta para:

- roubar credenciais;
- burlar autenticação ou controles de acesso sem autorização;
- quebrar DRM/licenças;
- redistribuir código/asset proprietário como se fosse próprio;
- operar serviços de terceiros de forma não autorizada.

O formulário do REA Lab exige confirmação de uso responsável antes de criar um job.

## Link Shield

URLs submetidas ao REA Lab passam pelo CreativeZone Link Shield.

Se o destino receber `block`, o job não é criado.

Isso evita que o gateway do fórum encaminhe automaticamente uma URL reconhecida como maliciosa para análise web normal.

Malware analysis futuro deverá ocorrer por artefato/worker isolado, não por navegação automática do fórum.

## Banco

### rea_lab_jobs

Registra:

- usuário;
- projeto opcional;
- modo;
- target type;
- source type;
- referência;
- pergunta;
- objetivo;
- status;
- plano;
- worker;
- versão do REA;
- resultado;
- evidências;
- limitações.

### rea_lab_events

Timeline do job.

Exemplos:

- created;
- waiting_worker;
- running;
- completed;
- failed;
- cancelled.

### rea_lab_specs

Resultado estruturado do fluxo de reconstrução:

- behavior_spec;
- implementation_plan;
- compatibility_tests;
- provenance.

Todas as tabelas usam RLS.

## Edge Function

`rea-lab`

Ações:

- `status`;
- `create_job`;
- `list_jobs`;
- `get_job`;
- `cancel_job`;
- `worker_callback`.

O callback do worker exige token dedicado.

## Planos

As quotas iniciais são deliberadamente conservadoras até medirmos o custo real do worker.

### FREE

- 1 run/mês;
- até 25 MB quando upload for ativado;
- Analyze;
- website;
- JavaScript;
- .NET;
- WASM.

Objetivo: permitir experimentação real sem tornar análise pesada ilimitada.

### PRO

- 8 runs/mês;
- até 250 MB;
- Analyze;
- Behavior Specification;
- website;
- JavaScript;
- Electron;
- .NET;
- APK;
- WASM;
- SQLite;
- HAR;
- integração com projeto.

### ELITE

- 25 runs/mês;
- até 1 GB;
- Analyze;
- Behavior Specification;
- Improved Behavioral Rebuild;
- todos os target types previstos;
- prioridade de fila;
- integração com DevHub;
- providers avançados.

### System Owner

Acesso equivalente ao ELITE sem limite mensal operacional.

## Privacidade

Jobs são privados por padrão.

Privacidade não é benefício premium.

O plano controla:

- quantidade;
- tamanho;
- target types;
- profundidade;
- automação.

Não controla o direito básico de manter uma investigação privada.

## Interface

Rota:

```text
/rea-lab
```

A interface já possui:

- seleção Analyze / Behavior Spec / Rebuild;
- target types;
- URL / GitHub;
- plano/cota;
- status do worker;
- criação de jobs;
- histórico;
- cancelamento.

Upload será habilitado quando o worker e o storage privado estiverem conectados.

## Estado atual

### Concluído

- [x] tabelas e RLS;
- [x] entitlements FREE/PRO/ELITE;
- [x] Edge Function `rea-lab`;
- [x] Link Shield no ingresso de URLs;
- [x] quotas por plano;
- [x] rota /rea-lab;
- [x] UI de modos;
- [x] UI de targets;
- [x] histórico de jobs;
- [x] worker callback contract;
- [x] documentação;
- [x] tópico oficial.

### Próxima subetapa

- [ ] infraestrutura REA Worker;
- [ ] Node.js 22+;
- [ ] instalação `rea-agents`;
- [ ] container sandbox;
- [ ] health/readiness do REA;
- [ ] website worker;
- [ ] JavaScript/Electron worker;
- [ ] upload privado;
- [ ] APK/.NET/WASM;
- [ ] Ghidra/JADX/etc.;
- [ ] Behavior Specification real;
- [ ] pipeline Rebuild → DevHub.

## Arquivos

- `src/ReaLab.jsx`;
- `src/ReaLab.css`;
- `src/services/reaLabApi.js`;
- `supabase/functions/rea-lab/index.ts`;
- `supabase/migrations/20261015222427_creativezone_rea_lab_foundation.sql`.

## Princípio

> Understand precisely. Document evidence. Rebuild independently. Improve deliberately.
