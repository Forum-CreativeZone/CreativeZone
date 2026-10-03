# Fórum - Modular Frontend Architecture

## Objetivo
Separar o frontend desktop e mobile em componentes pequenos e reutilizáveis, evitando um arquivo único com toda a aplicação.

## Estrutura alvo

src/
├── app/
│   ├── App.jsx
│   └── routes.jsx
│
├── components/
│   ├── shared/
│   │   ├── Header.jsx
│   │   ├── Avatar.jsx
│   │   └── Icon.jsx
│   │
│   ├── desktop/
│   │   ├── DesktopForumLayout.jsx
│   │   ├── DesktopSidebar.jsx
│   │   └── DesktopTopicList.jsx
│   │
│   ├── mobile/
│   │   ├── MobileForumLayout.jsx
│   │   ├── BottomNavigation.jsx
│   │   └── MobileTopicList.jsx
│   │
│   └── forum/
│       ├── TopicCard.jsx
│       ├── TopicComposer.jsx
│       ├── ReplyList.jsx
│       └── ProfileCard.jsx
│
├── hooks/
│   ├── useAuth.js
│   ├── useForumData.js
│   └── useForumRealtime.js
│
├── services/
│   ├── forumApi.js
│   ├── authApi.js
│   ├── mediaApi.js
│   └── reactionApi.js

## Regras
- Desktop e mobile compartilham serviços e componentes de domínio.
- Layouts ficam separados.
- Nenhum componente deve acessar Supabase diretamente.
- Comunicação com backend somente via services/hooks.
