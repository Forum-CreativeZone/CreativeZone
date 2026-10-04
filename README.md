# CreativeZone — fórum React + Supabase

Frontend React/Vite da comunidade **CreativeZone**, publicado via Cloudflare Workers Static Assets e conectado ao Supabase.

## Stack

- React + Vite
- Supabase Auth
- Supabase Postgres + Row Level Security (RLS)
- Supabase Realtime
- Cloudflare Workers Static Assets
- GitHub Actions para validação de build

## Executar

```sh
npm ci
npm run dev
```

Para usar o backend real, configure no ambiente de build:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

A chave publishable é a recomendada. Por compatibilidade, o projeto também aceita:

```text
VITE_SUPABASE_ANON_KEY
```

Essas chaves são de cliente e podem ser expostas no bundle do frontend quando o banco está protegido por RLS. **Nunca coloque service_role ou uma secret key no frontend/Cloudflare Build.**

## Funcionalidades conectadas ao Supabase

- cadastro por e-mail e senha;
- login, sessão persistente e logout;
- criação automática de perfil ao cadastrar;
- membros e perfis públicos;
- categorias reais;
- criação de tópicos por usuários autenticados;
- leitura pública de tópicos;
- respostas persistidas em `posts`;
- Realtime para tópicos e respostas;
- notificações geradas pelo banco quando alguém responde a um tópico;
- RLS para autoria e edição/exclusão do próprio conteúdo;
- tema escuro/claro persistente;
- busca e filtros no frontend;
- favoritos e rascunho permanecem locais por enquanto.

## Banco

As migrations do projeto Supabase devem ser mantidas em `supabase/migrations/`.

## Publicar

```sh
npm run build
```

O diretório `dist/` contém o site de produção e é usado pela configuração do Cloudflare.
