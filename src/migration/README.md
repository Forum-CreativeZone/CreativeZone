# Frontend migration status

## Completed

- Supabase Auth integrado à interface publicada
- Sessão persistente e listener de mudanças de autenticação
- Profiles reais vinculados a `auth.users`
- Categories reais
- Topics reais
- Posts/respostas reais
- RLS para leitura pública e autoria de tópicos/respostas
- Edição e exclusão do próprio conteúdo permitidas por RLS
- Realtime para topics/posts
- Listagem real de membros e últimas respostas
- Dados mock removidos do feed principal
- Persistência de tópicos/respostas deixou de usar localStorage

## Ainda local

- favoritos/salvos
- rascunho de composição
- preferência de tema claro/escuro

## Próximas etapas

- UI de edição/exclusão de tópico e resposta
- bookmarks persistidos no Supabase
- reações persistidas
- notificações pessoais com contador e marcar como lida
- upload de avatar e mídia associado a tópicos/respostas
- moderação e denúncias
- URLs/rotas próprias para tópicos, categorias e perfis
- testes automatizados
