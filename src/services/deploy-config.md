# Production checklist

## Frontend
- Build with Vite
- Official production URL: `https://forum.creativezone.pro`
- Configure environment variables
- Connect Supabase URL and publishable key

## Backend
- Supabase Auth enabled
- RLS policies reviewed
- Storage buckets configured
- Realtime enabled

## Release
- npm run build
- Deploy generated dist folder
