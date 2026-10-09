# SEO e Google Search — CreativeZone

## O que já é automático

O build gera SEO específico para páginas públicas do fórum:

- URLs canônicas legíveis de tópicos no formato `/topico/<slug>--<uuid>`.
- `title`, description, canonical, Open Graph e Twitter Cards por tópico.
- JSON-LD `DiscussionForumPosting` para tópicos.
- JSON-LD `CollectionPage` para fóruns/categorias.
- HTML pré-gerado no build para tópicos e fóruns públicos.
- `sitemap.xml` com páginas públicas, fóruns e tópicos.
- `robots.txt` apontando para o sitemap.
- rotas privadas e utilitárias recebem `noindex` no cliente.
- links principais de categorias e tópicos são links HTML rastreáveis.

O gerador usa as mesmas variáveis públicas já usadas pelo frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` ou `VITE_SUPABASE_ANON_KEY`

## Quando o domínio próprio for comprado

Definir no ambiente de produção:

`VITE_PUBLIC_SITE_URL=https://forum.seudominio.com`

Depois fazer um novo deploy. O sitemap, robots e canonicals passarão a usar o domínio novo automaticamente.

Antes de trocar, manter apenas uma origem pública principal para evitar duplicidade de URLs. Depois que o domínio estiver validado, configurar redirecionamento permanente (301/308) do host antigo `*.workers.dev` para o domínio novo, preservando o caminho de cada página.

## Google Search Console

Depois que o domínio estiver apontado para o Worker:

1. Adicionar a propriedade de domínio no Google Search Console.
2. Fazer a verificação por DNS.
3. Enviar `https://forum.seudominio.com/sitemap.xml`.
4. Inspecionar algumas URLs de tópicos e solicitar indexação.
5. Validar um tópico no Rich Results Test para conferir o `DiscussionForumPosting`.

## Títulos

Os títulos visíveis dos tópicos também são usados como base do título SEO. Não é necessário reescrevê-los quando já forem claros e descritivos. Evitar repetição artificial de palavras-chave.

## Sitemap ao vivo

Além do `/sitemap.xml` gerado em cada build, existe um sitemap público dinâmico no Supabase:

`https://ljxbewukkvenwjnjjjyf.supabase.co/functions/v1/creativezone-sitemap`

O `robots.txt` anuncia os dois. O sitemap ao vivo consulta tópicos e categorias públicas diretamente e, por isso, novos tópicos podem aparecer nele sem depender de um novo deploy do frontend.

Quando o domínio próprio entrar em produção, definir também o secret `PUBLIC_SITE_URL` da Edge Function com a mesma origem usada em `VITE_PUBLIC_SITE_URL`, para que o sitemap dinâmico passe a emitir os URLs do novo domínio.
