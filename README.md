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

- replace `REPLACE_WITH_KV_NAMESPACE_ID`
- replace `REPLACE_WITH_D1_DATABASE_ID`
- set `vars.ALLOWED_ORIGINS` to your frontend origin(s), comma-separated

3. Initialize the local database:

```sh
npm run db:init
wrangler d1 execute tracker-platform --local --file=./infra/d1/migrations/002_users.sql -c infra/wrangler.jsonc
```

4. Run the app:

```sh
npm run dev
```

Frontend runs on `http://localhost:5000`.
Worker API runs via Wrangler and is proxied through Vite at `/api`.

## Demo mode

Demo and synthetic sandbox data are disabled by default in production builds. For explicit local development-only sandbox behavior, set:

```sh
VITE_ENABLE_DEMO_MODE=true
VITE_ENABLE_SANDBOX_DATA=true
```

Also set `vars.APP_ENV` to `development` locally and `production` in deployed environments so synthetic worker-side P2P data is disabled outside sandbox use.

## Validation

```sh
npm run build
npm test
npx tsc --noEmit
npm run lint
```

## Deploy

1. Apply D1 migrations to the target environment.
2. Configure KV, D1, and `ALLOWED_ORIGINS`.
3. Deploy the Worker:

```sh
wrangler deploy -c infra/wrangler.jsonc
```

The cron in `infra/wrangler.jsonc` triggers the Worker scheduled handler every 5 minutes to refresh KV-backed P2P snapshot history.

