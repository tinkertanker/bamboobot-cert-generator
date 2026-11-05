# AGENTS.md

Bamboobot is a Next.js (Pages Router) app for making certificates: upload a background image, place text fields on it, paste a table of names, then generate PDFs in bulk and optionally email them. It is an internal Tinkertanker tool sized for 50 to 500 recipients per batch.

The code is the source of truth. If this file disagrees with the code, trust the code and fix this file in the same change.

## Commands

```bash
npm ci                     # install (npm only; Node 22+)
npx prisma generate        # after install or any change to prisma/schema.prisma
npx prisma db push         # create or update the local SQLite database
npm run dev                # builds the PDF worker, then starts the app

npm test -- <file>         # run one Jest file (prefer this)
npm test                   # full Jest suite; builds run separately, without deleting build/cache directories from tests
npm run lint               # ESLint CLI; Next 16 does not run lint during builds
npm run build              # production build, also type-checks app and test code
npm run build:worker       # rebuild public/pdf-worker.js after changing worker or shared PDF code
npm run build:agent        # bundle the separate unattended certificate worker
npm run agent:worker       # requires AGENT_CERTIFICATES_ENABLED=true and migrated SQLite
npm run build:cloudflare   # enables Workers + server project persistence; staging target
npx wrangler deploy --dry-run --outdir /tmp/bamboobot-worker  # local packaging only, not deployment
```

CI runs the Node application build (including the PDF worker), `npm test`, `npm run lint`, the Cloudflare build and a Wrangler dry run on Node 22. Both Node and Workers builds are required; their runtime/persistence settings differ. CI does not deploy, and the Playwright E2E tests are not run in CI.

## How it works, and what is easy to get wrong

**PDF generation is client-first.** `getPdfGenerationMethod` picks the browser worker whenever the browser supports it, and falls back to the server when it does not or when the batch is too big for the device. Dev Mode can force server generation for comparison. Server batches over 100 rows use progressive generation (`PROGRESSIVE_PDF`).

**Keep preview, worker and server in agreement.** Put layout changes in `lib/pdf/shared/` so both generators get them. Text positions are stored as percentages from the top-left; callers normalise these to fractions for `pdf-generation-core.ts`, which converts them to bottom-left PDF space. Check that the on-screen preview and text measurement still match the PDF. The older `coordinate-transform.ts` helper has no production callers.

**The worker bundle is committed.** `public/pdf-worker.js` and its chunk files are checked in. If you touch the client worker, `lib/pdf/shared/` or anything they import, run `npm run build:worker` and commit the regenerated files.

**PDF parsing has per-document budgets.** `scripts/patch-pdf-lib.cjs` applies `lib/pdf/parser-budget.cjs` to checksum-pinned pdf-lib 1.17.1 CJS/ESM parsers during install, builds and tests. Do not remove the hooks or upgrade the dependency without re-auditing them and running the parser-budget tests plus the built-worker tests. Rebuild the committed worker after changing either file. The browser additionally terminates parsing workers on a main-thread deadline; server deadlines are cooperative, backed by deterministic work limits. These are not process-wide RSS limits.

**Adding a font touches about ten files.** Grep for an existing family such as `GreatVibes` to find them all, including both font loaders (client and server) and the `localFont` entries in `pages/_app.tsx` (certificate fonts use `preload: false`). The font validation test only checks the font files and capabilities.

**Projects are saved in localStorage by default.** Server persistence (`/api/projects`, Prisma) is only used when `NEXT_PUBLIC_PROJECT_SERVER_PERSISTENCE=true`. That is a `NEXT_PUBLIC_` variable, so it is inlined at build time; `.dockerignore` excludes `.env`, so the Docker build gets it as a build arg that `docker-compose.yml` forwards from `.env` (changing it needs a rebuild). In server mode the migration hook offers to import browser projects through `/api/projects/import`, which is idempotent by `clientProjectId` and returns `importedIds`; only those browser copies are deleted, so never clear local projects without that confirmation. localStorage is scoped to the signed-in account; use the existing key prefixes so account switching still purges correctly.

**User files never go in `public/`.** Uploads and generated PDFs live under `storage/` locally (or `LOCAL_STORAGE_DIR`, `/app/storage` in Docker), resolved through `lib/paths.ts`. Download links are signed and expire.

**External-agent jobs are opt-in.** Agent routes authenticate sessions/PATs independently, and only an owner browser session may approve actual samples. Production uses D1/R2 with checkpointed preparation and the existing minute-cron execution; `scripts/agent-worker.ts` is the SQLite/filesystem worker for Node installations, not production. See `docs/AGENT_CERTIFICATES.md` for runtime-specific limits, approval, migrations and rollback.

**Workers environments are explicitly separated.** `build:cloudflare` inlines `BAMBOOBOT_RUNTIME=workers`, which selects request-scoped D1 and private R2 bindings. Native D1 batches/statements are required for atomic work: Prisma's D1 `$transaction` shim is not atomic and the proxy rejects it. The Worker entry recovers PDF/email jobs and runs bounded object expiry. Durable email admission and terminal refunds are atomic; interrupted dispatches are delivery-unconfirmed, never automatically retried. Default `wrangler.jsonc` names only staging resources, with `EMAIL_DELIVERY_MODE=preview` and no live mail credentials. Production requires explicit `--config wrangler.production.jsonc` for both OpenNext build and Wrangler deploy; see `docs/CLOUDFLARE_PRODUCTION.md` for the authorised cutover and rollback boundary. The recovery archive is admin-readable but excluded from deletion and expiry. Later production, OAuth client, billing or mail-delivery changes still need scoped approval. Recovered configuration/data belongs outside Git in restrictive private directories.

**Auth is enforced in middleware.** `middleware.ts` gates every page except `/` and every API except `/api/auth/*`, `/api/agent` and its descendants (which authenticate within each route), `/api/files/download` and cleanup calls carrying `CLEANUP_SECRET_KEY`. `REQUIRE_AUTH` is read at runtime and defaults to on in production and off in development. New API routes still need their own authorisation and rate limits, because the middleware only checks that someone is signed in. Most routes wrap their handler with `withFeatureGate` or `requireAuth`.

**Admin areas.** `pages/admin/*` is the tier-based admin area (tiers: `free`, `plus`, `admin`, `super_admin`). `pages/dashboard.tsx` is a separate older page gated by `ADMIN_EMAILS`.

**Dev Mode** (the checkbox in the editor) only exists when `NODE_ENV=development`. It loads a preset certificate and data and shows the storage monitors.

## Conventions

- Import from the repo root with `@/` (for example `@/lib/paths`).
- Function components with hooks; keep feature state in a hook in `hooks/`.
- Use PascalCase component names/files, `useCamelCase` hook names/files and kebab-case utility modules. Do not rename persisted keys or API fields for style consistency.
- Colours come from `COLORS` in `utils/styles.ts`.
- User-facing errors come from `utils/errorMessages.ts` where a message exists; log with `lib/log.ts` rather than bare `console.log` in server code.
- British English in UI copy, docs and comments.
- Commit messages follow Conventional Commits with an optional scope: `fix(auth): ...`, `perf: ...`, `security: ...`, `test: ...`.

## Tests

Tests must exercise the real module. Do not copy logic into a test file, and do not write tests that only check mocks, props echoed back as CSS classes, or third-party libraries (these were pruned in #73). Add or update a test when you change behaviour.

## Docs

- `TODO.md` is the open backlog. Update it when you finish or add a backlog item.
- `docs/SAAS-ARCHITECTURE.md` and `docs/OSS-STRATEGY.md` are proposals for a possible public release, not a description of the current system.
