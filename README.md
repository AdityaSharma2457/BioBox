# Bio Box

Bio Box is a creator portfolio app built with React, Vite, and TypeScript. The production app runs as one Cloudflare Worker: the Worker serves the React site and its API, Cloudflare D1 stores account and portfolio data, and uploaded image/audio/video assets are stored as D1 BLOBs.

## Local development

Requirements: Node.js 20 or newer and npm.

```sh
npm install
Copy-Item .env.example .dev.vars
```

Set `JWT_SECRET` in `.dev.vars` to a random secret of at least 32 characters. For the Cloudflare runtime and local D1 database, run:

```sh
npx wrangler d1 create bio-box-production
npm run cf:dev
```

Apply the migration locally before using the app:

```sh
npx wrangler d1 migrations apply bio-box-production --local
```

The older Express/SQLite API remains available for its existing test suite and optional local development: copy `.env.example` to `.env`, then run `npm run dev`.

## Deploy to Cloudflare

1. Authenticate with `npx wrangler login`.
2. Create the production D1 database with `npm run d1:create`. Copy its ID into `database_id` in `wrangler.jsonc` in place of `REPLACE_WITH_D1_DATABASE_ID`.
3. Apply the schema with `npm run d1:migrate`.
4. Set the Worker secret: `npx wrangler secret put JWT_SECRET`. Use a unique random value of at least 32 characters.
5. Build and deploy with `npm run deploy`.

The Wrangler configuration binds D1 as `DB` and the static assets as `ASSETS`. The React single-page app, API, and public asset routes share the Worker origin, so no CORS origin setting is needed. Add a custom domain in the Cloudflare dashboard after the first deployment if desired.

## Commands

- `npm run dev` — local Express API with Vite frontend.
- `npm run cf:dev` — Cloudflare Worker and local D1 development.
- `npm run build` — type-check and build the Cloudflare app.
- `npm run deploy` — build and deploy the Worker.
- `npm run build:server` — compile the legacy Express API.
- `npm test` — run the existing API workflow tests.
- `npm run lint` — run Oxlint.

## Notes

Paid-plan activation is mocked; no payment is collected. `FREE1MONTH` and `FREE1YEAR` activate the matching durations. Instagram profile photos are provided manually; this app does not scrape Instagram or include an OAuth integration. Preview endpoints make outbound requests to supported providers. Rate limits on the Worker are per isolate; use a Cloudflare rate limiting rule for globally coordinated production throttling.
