# Bio Box

Bio Box is a creator portfolio app built with React, Vite, and TypeScript. The production app runs as one Cloudflare Worker. D1 stores account, portfolio, subscription, and uploaded-file data. Larger uploaded files are split into chunks so each D1 row stays below its 2 MB row limit.

## Local development

Requirements: Node.js 20 or newer and npm.

```sh
npm install
Copy-Item .env.example .dev.vars
```

Set `JWT_SECRET` in `.dev.vars` to a random secret of at least 32 characters. Create/configure D1 and start the Cloudflare Worker locally:

```sh
npx wrangler d1 create bio-box-production
npx wrangler d1 migrations apply bio-box-production --local
npm run cf:dev
```

The older Express/SQLite API remains available for its existing test suite and optional local development: copy `.env.example` to `.env`, then run `npm run dev`.

## Deploy to Cloudflare

1. Authenticate with `npx wrangler login`.
2. Create the production D1 database once with `npm run d1:create` (do not use this as the Cloudflare build command). Copy the returned ID into `database_id` in `wrangler.jsonc`. The Worker name is `biobox` to match the connected Cloudflare build project.
3. Apply the schema with `npm run d1:migrate`.
4. Set the Worker secret with `npx wrangler secret put JWT_SECRET`. Enter a unique random value of at least 32 characters when prompted. You can also add it in Workers & Pages → `biobox` → Settings → Variables and Secrets → Add → Secret, then deploy the change. The Worker configuration requires this secret so a future deployment reports a clear missing-secret error.
5. Build and deploy with `npm run deploy`.

The Worker binds D1 as `DB` and static assets as `ASSETS`. In Cloudflare Workers Builds, use `npm run build` as the build command and `npx wrangler deploy` as the deploy command. No R2 bucket or R2 account setup is required.

## Import existing local SQLite data

The schema migration does not copy local SQLite records automatically. To import the local account, portfolio, subscription, and uploaded files, authenticate Wrangler with `npx wrangler login`, then run:

```powershell
npm run data:export
powershell.exe -ExecutionPolicy Bypass -File .\data\import-local-data.ps1
```

This generates a private SQL file under the ignored `data/` directory, applies D1 migrations, and imports account records and chunked file contents into D1. The SQL export splits media into 32 KB chunks so each generated SQL statement remains under D1's statement-size limit. `INSERT OR IGNORE` makes reruns idempotent.

## Commands

- `npm run dev` — run the Express API and Vite frontend locally.
- `npm run cf:dev` — run the Cloudflare Worker with local D1.
- `npm run build` — type-check and build the Cloudflare app.
- `npm run deploy` — build and deploy the Worker.
- `npm run data:export` — prepare a private import of local SQLite data for D1.
- `npm run build:server` — compile the legacy Express API.
- `npm test` — run API workflow tests.
- `npm run lint` — run Oxlint.

## Notes

Paid-plan activation is mocked; no payment is collected. `FREE1MONTH` and `FREE1YEAR` activate the matching durations. Instagram profile photos are provided manually; this app does not scrape Instagram or include an OAuth integration. Preview endpoints make outbound requests to supported providers. Rate limits on the Worker are per isolate; use a Cloudflare rate limiting rule for globally coordinated production throttling.
