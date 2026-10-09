# Third-party services — CreativeZone Security

Este documento registra dependências externas de dados/protocolo utilizadas pelo CreativeZone Security.

## OSV

Documentação: https://google.github.io/osv.dev/

Utilização na CreativeZone:

- consulta de vulnerabilidades por pacote/ecossistema/versão;
- consultas em lote;
- detalhes de vulnerabilidades;
- aliases;
- ranges afetados;
- eventos de correção;
- referências.

A CreativeZone não apresenta OSV como uma certificação. Os dados são usados como fonte de vulnerabilidades conhecidas para compor uma análise própria.

## GitHub

Documentação: https://docs.github.com/rest/

Utilização na CreativeZone:

- metadados do repositório;
- branch padrão;
- árvore Git;
- SHA auditado;
- inventário/SBOM quando disponível;
- fallback para manifests e lockfiles públicos.

A auditoria automática atual de repositório trabalha com repositórios públicos. Suporte definitivo a conteúdo privado deve usar GitHub App com permissões mínimas e consentimento explícito.

## Regra de manutenção

Mudanças de endpoint, autenticação, depreciações e formatos de SBOM/manifests devem ser acompanhadas antes de alterar o motor de produção.
