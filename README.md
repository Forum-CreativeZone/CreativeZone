# Fórum Adrenaline — frontend

Frontend React/Vite baseado no arquivo Figma `dqa1NQghqO58z4rYt79NGE`.

## Executar

```sh
npm ci
npm run dev
```

## Publicar

```sh
npm run build
```

O diretório `dist/` contém o site de produção. A configuração Cloudflare existente usa esse diretório. Node.js 20.19+ ou 22.12+.

## Referências implementadas

- Início desktop: frame `4:123`, 1440 × 1024.
- Início mobile: frame `223:737`, 375 × 813.
- Composição de tópico: frame `82:2376`, adaptado também para celular.
- Os demais painéis são interações locais de demonstração, não uma reprodução completa de todas as telas do arquivo Figma.

Os PNGs e SVGs em `src/assets/figma/` foram exportados das camadas originais e são importados pelo Vite, incluindo os recortes específicos mobile. A fonte DM Sans também integra o build. Nenhum asset depende de URL temporária do Figma. As exportações anteriores em `assets/` permanecem como referência.

## Teste sem backend

Busca, paginação, filtros de tema, favoritos, rascunhos, criação de tópicos e respostas funcionam no navegador. Tópicos, respostas e favoritos são locais via localStorage; não há autenticação nem compartilhamento entre usuários. A paginação reflete a quantidade real de dados de demonstração, em vez dos números ilustrativos do Figma. Os atalhos de notícias levam ao portal Adrenaline.

## Validação

- Build de produção concluído.
- Sem erros de JavaScript ou imagens quebradas.
- Geometria desktop conferida contra o Figma para listas, coluna lateral e notícias.
- Testes de busca, favoritos, salvar/restaurar rascunho, criar/recarregar tópico, responder e fechar por Escape.
- Responsividade conferida em 375, 390, 760, 768, 1024 e 1440 px.
