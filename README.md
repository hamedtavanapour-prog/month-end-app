# Month End

Secure inventory operations for multi-department hospitality teams.

## Applications

- `apps/web` — Next.js web application
- `apps/mobile` — reserved for the future Expo iOS and Android application

## Shared packages

- `packages/core` — shared inventory rules and types
- `packages/validation` — shared validation rules

## Backend

Supabase provides authentication, Postgres data storage, private file storage, and row-level access control. Database changes are versioned in `supabase/migrations`.

## Local development

Copy `apps/web/.env.example` to `apps/web/.env.local`, fill in the Supabase project values, then run:

```bash
npm install
npm run dev
```
