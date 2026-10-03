# Frontend migration status

## Completed

- Supabase services created
- Auth service created
- Forum API created
- Media upload service created
- Realtime hook created
- React components separated from the original prototype

## Current migration

The original `main.jsx` still contains prototype state and mock data. The next refactor replaces:

- `initialTopics`
- `mobilePopular`
- localStorage persistence
- local reply state

with:

- `useForumData`
- `useAuth`
- `useForumRealtime`
- Supabase topics/posts/profiles
