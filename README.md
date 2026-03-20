# New P2P Tracker

React + Vite frontend with a Cloudflare Worker API, D1-backed merchant workflow data, and KV-backed P2P tracker snapshots.

## Architecture

- `src/`: React application, auth/session-aware UI, merchant workspace, trading pages.
- `server/index.ts`: Hono-based Worker API for auth, merchant relationships, deals, approvals, messaging, notifications, analytics, and P2P tracker reads.
- `infra/wrangler.jsonc`: Worker entrypoint, D1/KV bindings, cron trigger.
- `infra/d1/migrations/`: database schema migrations.

## Local setup

1. Install dependencies:

```sh
npm install
```

2. Configure Cloudflare resources in `infra/wrangler.jsonc`:

- replace the example KV namespace ID and D1 database ID with your own values
- set `vars.APP_ENV` to `development` locally and `production` in production
- set `vars.ALLOWED_ORIGINS` to an explicit comma-separated frontend allowlist
- do not use `*` for production origins

3. Initialize the local database:

```sh
npm run db:init
wrangler d1 execute tracker-platform --local --file=./infra/d1/migrations/002_users.sql -c infra/wrangler.jsonc
wrangler d1 execute tracker-platform --local --file=./infra/d1/migrations/003_auth_hardening.sql -c infra/wrangler.jsonc
```

4. Run the app:

```sh
npm run dev
```

Frontend runs on `http://localhost:5000`.
Worker API runs via Wrangler and is proxied through Vite at `/api`.

## Frontend and auth configuration

- `VITE_API_BASE_URL` is optional. If omitted, the frontend uses same-origin requests.
- `VITE_ENABLE_DEMO_MODE=true` only enables demo fallback in development builds. Production builds ignore it.
- Login uses an `HttpOnly` session cookie. The frontend no longer depends on receiving reusable session tokens from the API.
- Password reset and email verification are intentionally fenced unless a real backend email flow is implemented.

## Validation

```sh
npm run build
npm test
npx tsc --noEmit
npm run lint
```

## Deploy

1. Apply D1 migrations to the target environment.
2. Configure KV, D1, `APP_ENV=production`, and a strict `ALLOWED_ORIGINS` allowlist.
3. Deploy the Worker:

```sh
wrangler deploy -c infra/wrangler.jsonc
```

The cron in `infra/wrangler.jsonc` triggers the Worker scheduled handler every 5 minutes to refresh KV-backed P2P snapshot history.
