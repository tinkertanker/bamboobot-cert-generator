# AGENTS.md

Guidance for coding agents (Claude Code, Codex, Cursor and others) working in this repository.

Bamboobot is a Next.js (Pages Router) app for making certificates: upload a background image, place text fields on it, paste a table of names, then generate PDFs in bulk and optionally email them. It is an internal Tinkertanker tool sized for 50 to 500 recipients per batch.

The code is the source of truth. If this file disagrees with the code, trust the code and fix this file in the same change.

## Commands

```bash
npm ci                     # install (npm only; Node 22+)
npx prisma generate        # after install or any change to prisma/schema.prisma
npx prisma db push         # create or update the local SQLite database
npm run dev                # builds the PDF worker, then starts http://localhost:3000

npm test -- __tests__/lib/rate-limit.test.ts   # run one Jest file (prefer this)
npm test                   # full Jest suite; includes __tests__/build.test.ts, which runs a full `npm run build` and deletes .next
npm run lint               # ESLint; `next build` skips lint, so run this yourself
npm run build              # production build, also type-checks app code
npm run build:worker       # rebuild public/pdf-worker.js after changing worker or shared PDF code
```

CI (`.github/workflows/test.yml`) runs `npm ci`, `npm run build:worker`, `npm test` and `npm run lint` on Node 22. Playwright E2E tests in `e2e/` are not run in CI.

`npx tsc --noEmit` is clean for app code but currently reports jest-dom matcher type errors in test files; those are known and not caused by your change.

## Where things live

- `pages/app.tsx` is the editor and wires most hooks together. `pages/index.tsx` is the public landing page; signed-in users are redirected to `/app`.
- `pages/admin/*` is the tier-based admin area. `pages/dashboard.tsx` is a separate older page gated by `ADMIN_EMAILS`.
- `pages/api/*` holds API routes. Most wrap their handler with `withFeatureGate` (`lib/server/middleware/featureGate.ts`) or `requireAuth` (`lib/auth/requireAuth.ts`).
- `hooks/` holds feature state (`useTableData`, `useProjectManagement`, `usePdfGenerationMethods`, `useEmailConfig` and so on). `components/panels/` and `components/modals/` hold the UI.
- `lib/pdf/shared/` is PDF layout code shared by the browser worker and the server: `pdf-generation-core.ts` (text placement, shrink-to-fit, multi-line) and `coordinate-transform.ts`.
- `lib/pdf/client/` is browser generation: the worker entry is `worker/pdf-worker-with-fonts.ts`, bundled by `webpack.worker.config.js` into `public/pdf-worker.js`.
- `pages/api/generate.ts`, `pages/api/generate-progressive.ts` and `lib/pdf-generator.ts` are server generation.
- `lib/email/` holds the email queue and providers (`providers/resend.ts`, `providers/ses.ts`, chosen by `provider-factory.ts` from the credentials present).
- `lib/storage-config.ts`, `lib/r2-client.ts`, `lib/s3-client.ts` and `lib/storage/` handle file storage (local, Cloudflare R2 or Amazon S3) and expiry cleanup.
- `lib/server/tiers.ts` and `types/user.ts` define user tiers (`free`, `plus`, `admin`, `super_admin`) and their limits.
- `prisma/schema.prisma` defines the SQLite models for NextAuth, projects, tiers and usage.
- Shared types live in `types/` (mainly `types/certificate.ts`), plus `lib/pdf/types.ts` and `lib/email/types.ts`.

## How it works, and what is easy to get wrong

**PDF generation is client-first.** `getPdfGenerationMethod` in `hooks/usePdfGenerationMethods.tsx` picks the browser worker whenever the browser supports it, and falls back to the server when it does not or when `lib/pdf/client/individual-capacity.ts` decides the batch is too big for the device. Dev Mode can force server generation for comparison. Server batches over 100 rows use progressive generation (`PROGRESSIVE_PDF` in `utils/constants.ts`).

**Keep preview, worker and server in agreement.** Put layout changes in `lib/pdf/shared/` so both generators get them. Text positions are stored as percentages from the top-left; PDF space is bottom-left, and `coordinate-transform.ts` converts between them. Check that the on-screen preview (`components/CertificatePreview.tsx`, `utils/textMeasurement.ts`, `utils/fontScale.ts`) still matches the PDF.

**The worker bundle is committed.** `public/pdf-worker.js` and its chunk files are checked in. If you touch `lib/pdf/client/worker/`, `lib/pdf/shared/` or anything they import, run `npm run build:worker` and commit the regenerated files.

**Adding a font touches about ten files.** Grep for an existing family such as `GreatVibes` to find them all: `FontFamily` in `types/certificate.ts`, the TTFs in `public/fonts/`, the `localFont` entries in `pages/_app.tsx` (certificate fonts use `preload: false`), `FONT_CAPABILITIES` in `utils/constants.ts`, both font loaders (`lib/pdf/client/font-manager.ts`, `lib/pdf-generator.ts`), the shared core and worker, the preview and text measurement, and the picker in `components/panels/FormattingPanel.tsx`. `__tests__/fonts/font-validation.test.ts` only checks the font files and capabilities.

**Projects are saved in localStorage by default.** Server persistence (`/api/projects`, Prisma) is only used when `NEXT_PUBLIC_PROJECT_SERVER_PERSISTENCE=true` (`lib/project-storage.ts`). That is a `NEXT_PUBLIC_` variable, so it is inlined at build time; `.dockerignore` excludes `.env`, so the Docker build gets it as a build arg that `docker-compose.yml` forwards from `.env` (changing it needs a rebuild). In server mode `hooks/useProjectMigration.ts` offers to import browser projects through `/api/projects/import`, which is idempotent by `clientProjectId` and returns `importedIds`; only those browser copies are deleted, so never clear local projects without that confirmation. localStorage is scoped to the signed-in account by `lib/storage/account-scope.ts`; use the existing key prefixes so account switching still purges correctly.

**User files never go in `public/`.** Uploads and generated PDFs live under `storage/` locally (or `LOCAL_STORAGE_DIR`, `/app/storage` in Docker), resolved through `lib/paths.ts`. Download links are signed and expire (`lib/security/signed-generated-url.ts`); file access checks are in `lib/security/private-file-access.ts`.

**Auth is enforced in middleware.** `middleware.ts` gates every page except `/` and every API except `/api/auth/*`, `/api/files/download` and cleanup calls carrying `CLEANUP_SECRET_KEY`. `REQUIRE_AUTH` is read at runtime (`lib/auth/runtime-policy.ts`) and defaults to on in production and off in development. New API routes still need their own authorisation and rate limits (`lib/rate-limit.ts`, `lib/pdf/server-limits.ts`, `lib/email/abuse-controls.ts`), because the middleware only checks that someone is signed in.

**Dev Mode** (the checkbox in the editor) only exists when `NODE_ENV=development`. It loads a preset certificate and data and shows the storage monitors.

## Conventions

- Import from the repo root with `@/` (for example `@/lib/paths`).
- Function components with hooks; keep feature state in a hook in `hooks/`.
- Tailwind for styling; colours come from `COLORS` in `utils/styles.ts`.
- User-facing errors come from `utils/errorMessages.ts` where a message exists; log with `lib/log.ts` (`debug`, `error`) rather than bare `console.log` in server code.
- British English in UI copy, docs and comments.
- Commit messages follow Conventional Commits with an optional scope, as in the git log: `fix(auth): ...`, `perf: ...`, `security: ...`, `test: ...`.

## Tests

Jest with jsdom and React Testing Library. Layout under `__tests__/` mirrors the code: `api/` (API routes, using `node-mocks-http`), `components/`, `hooks/`, `lib/`, `utils/`, `fonts/`, plus `middleware.test.ts`. Shared helpers are in `__tests__/helpers/` and AWS SDK mocks in `__tests__/__mocks__/`.

Tests must exercise the real module. Do not copy logic into a test file, and do not write tests that only check mocks, props echoed back as CSS classes, or third-party libraries (these were pruned in #73). Add or update a test when you change behaviour.

## Other docs

- `README.md`: features, setup and configuration for people running the app.
- `.env.example`: every supported environment variable, with comments.
- `TODO.md`: the open backlog. Update it when you finish or add a backlog item.
- `DEPLOYMENT_INSTRUCTIONS.md`, `docs/ENVIRONMENT_SETUP.md`, `docs/NGINX_CONFIGURATION.md`, `docs/UPLOAD_TROUBLESHOOTING.md`: Docker deployment.
- `docs/CLIENT_SIDE_PDF.md`: how browser PDF generation works.
- `docs/SAAS-ARCHITECTURE.md`, `docs/OSS-STRATEGY.md`: proposals for a possible public release, not a description of the current system.
