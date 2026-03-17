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

- replace `REPLACE_WITH_D1_DATABASE_ID`
- set `vars.ALLOWED_ORIGINS` to your frontend origin(s), comma-separated

> Note: `P2P_KV` is optional. If you do not bind a KV namespace, tracker snapshot endpoints still work with generated in-memory snapshots (no persisted history between requests).

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

Demo mode is disabled by default. To enable local demo fallback, set:

```sh
VITE_ENABLE_DEMO_MODE=true
```

## Validation

```sh
npm run build
npm test
npx tsc --noEmit
npm run lint
```

## Deploy

1. Apply D1 migrations to the target environment.
2. Configure D1 and `ALLOWED_ORIGINS` (and optionally `P2P_KV` if you want persisted tracker history).
3. Deploy the Worker:

```sh
wrangler deploy -c infra/wrangler.jsonc
```

The cron in `infra/wrangler.jsonc` triggers the Worker scheduled handler every 5 minutes to refresh KV-backed P2P snapshot history.
