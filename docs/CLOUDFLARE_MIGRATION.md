# Cloudflare migration — staging validation record

**Production cutover was subsequently authorised and executed on 20 October
2026.** See [the production record](CLOUDFLARE_PRODUCTION.md) for the exact revision,
hostname, clean production import, launch checks and rollback. This document
preserves the preceding isolated staging evidence. Staging remains preview-only;
its rejected OAuth callback was not added to the shared client. Code remains
local and uncommitted/unpushed. Source data and independent backups are preserved.

## Runtime and local checks

The existing Node/Docker runtime remains supported. Workers builds use the
pinned OpenNext adapter, operation-scoped Prisma with the D1 adapter, and private
R2 bindings instead of native SQLite and persistent disk. Do not switch runtime
after building: `BAMBOOBOT_RUNTIME` is inlined by Next.js. Each D1 operation
explicitly disconnects its Prisma WASM engine; request-client garbage collection
alone retained allocations under sustained authenticated artifact reads. The
Cloudflare build also enables browser project persistence at build time; a
runtime binding alone cannot set a `NEXT_PUBLIC_` flag in browser JavaScript.

```sh
npm ci
npm run lint
npm test
npm run build:cloudflare
npx wrangler deploy --dry-run --outdir /tmp/bamboobot-worker
```

`npm test` includes a Node production build that deletes `.next`; run it before,
not concurrently with, the Cloudflare build. CI performs both build paths and a
local Wrangler dry run, without deployment credentials.

`check:cloudflare` checks the custom entry point separately with JavaScript input
disabled. The app's TypeScript config excludes that entry point and generated
output: importing OpenNext's generated middleware into the app type graph can
replace the global Node `Buffer` type with `any`. Do not suppress the resulting
app errors or weaken attachment validation to work around generated code.

The staging package passed 109 Jest suites / 901 tests (including the Node
production build), lint, the separate Worker type check and OpenNext build.
The deployed package is 17,639.82 KiB uncompressed / 4,413.25 KiB gzip; Cloudflare
reported 130 ms startup. Version `a659c243-6593-44ec-b7df-4f2573738ebc`
includes the browser restore fix and paginated cleanup.
These are orb checks, not GitHub CI results.

`wrangler.jsonc` deliberately names only staging resources in the Tinkertanker
account (`b8b1032c61d9475cd00229c74db7ec72`):

- Worker: `bamboobot-staging`
- D1 `DB`: `bamboobot-staging`, ID `218f9e7e-cbb6-4dfe-97b4-8746b5051afa`
- R2 `FILES`: private `bamboobot-staging-files`
- `ASSETS`: generated `.open-next/assets`, never recovered user files
- HTTPS entry: `https://bamboobot-staging.tinkertanker.workers.dev`
- No production routes/custom domains or preview URLs
- `REQUIRE_AUTH=true`, server persistence enabled at build time, email preview mode
- Separate random staging auth/file signing secrets; no live mail credentials

`npm run preview:cloudflare` starts local workerd. Keep `.dev.vars` and local
binding state private. Use separate test signing secrets; do not load production
mail credentials into the local service. Bind restored state outside the Git
checkout. The request-scoped `/tmp` upload directory is scratch, not a backup.

Workers PDF jobs and HTTP rate limits persist in D1. A minute cron reclaims
expired PDF leases and processes serial batches within a shared 20-second
wall-time budget, yielding between certificates. A single render cannot be
interrupted; remote CPU/memory profiling is still required. PDF outputs use
deterministic private keys, and lease fencing protects progress commits.
Native D1 statements/batches replace the two transactional call sites; Prisma
`$transaction` fails closed on Workers because its D1 shim is not atomic.

Email submissions, payload references, quota charges/refunds, sending leases,
provider-wide windows/cooldown, ingestion capacity and paused-queue pressure are
durable. Native admission batches and triggers commit items with their charges;
duplicate content in a session is not sent/charged twice. Cancel/expiry/pressure
refund pending work once. An expired dispatch lease becomes **delivery
unconfirmed**, never automatically retried or refunded. Single/test routes use
the same ledger and global provider limiter. Staging's preview provider records
private R2 payloads without calling SES/Resend, even if credentials are present.

The minute cron processes email/PDF recovery and one 50-object expiry page,
persisting its cursor. Emailed objects and unrecognised metadata remain intact.
Mail previews expire after seven days; unreferenced payloads after one day.
Recovery archives are outside every cleanup namespace and cannot be deleted by
the admin storage deletion API. Workers dev-cleanup is paginated and touches only
generated/temp namespaces; callers continue with its returned cursor.

## Recovery and private import

The implementation base was fetched `origin/main` at
[`7896c43`](https://github.com/tinkertanker/bamboobot-cert-generator/commit/7896c438a07e4ee786d88a035ce9e3759afd7168).
The stopped server's source and working edits are preserved separately; its
checkout does not prove the container image revision. Docker-only deployment
edits were inspected, not overwritten or blindly applied to this checkout.

The original recovery handoff is in
[the recovery thread](https://ampcode.com/threads/T-01a1545b-2fc6-73dd-a2b4-48bda9d3bfb5).
Protected downloads in this orb are under
`/home/user/.private/bamboobot-recovery`, outside Git, with directories 0700 and
files 0600. Configuration archives, OAuth tokens, database exports, session
fixtures, object manifests and object contents must not be attached to chat,
Slack, Git, portals or public artifact URLs. Use authenticated thread-file
transfer into restrictive private directories when transferring protected data.

Verified recovery at 19 October 2026:

- Recovered SQLite: integrity `ok`, no foreign-key violations, 3 users and 3
  accounts; no server projects. Preserve IDs and OAuth relationships.
- All 75 local non-database files match recovered source SHA-256 hashes.
- Production R2: 2,551 objects, 1,622,274,076 bytes, downloaded with authenticated
  Cloudflare object access, SHA-256/read-back verified and stable inventories.
  The recovered S3-compatible credentials still fail; they were not reused.
- Local/R2 union: 2,595 keys, 1,678,733,878 bytes; 31 identical overlaps and no
  conflicting copies. The complete union was restored and read-back verified
  in local workerd R2.
- The complete union was also copied into private staging R2 under
  `archive/recovery-20261019/`, with original metadata and SHA-256 read-back
  verification of **all 2,595 objects / 1,678,733,878 bytes**. This includes
  **4 owner-scoped orphans**, distinct from **2,591 historical-unscoped assets**.
  YJ approved admin-only archival handling, not reassignment or weaker checks.
- A fresh empty-target D1 import contains all 3 users and 3 accounts, 0 source
  projects, all five migrations, and no foreign-key violations. Wrangler reports
  **No migrations to apply**. Staging acceptance adds clearly named synthetic
  users/projects/jobs; those are not recovered production records. A read-only
  comparison verified every recovered user/account field against the imported
  snapshot, including preserved IDs and OAuth relationships.

Private receipts: `staging-archive-verification.json`, `staging-d1-import.log`,
`staging-app-verification.json`, `staging-runtime-verification.json`,
`staging-worker-settings.json` and `staging-oauth-probe.json` under the private
recovery directory. The temporary bearer-only import Worker was replaced by the
authenticated app and its `RESTORE_KEY` secret deleted. Do not expose private
receipts/manifests, exports or synthetic session cookies as public artifacts.

`scripts/backup-r2.js` performs only authenticated GETs, paginates, preserves
metadata and writes a certified manifest only after content and inventory
validation. Supply the API token through the supported environment binding,
never as an argument. It refuses an existing destination directory.

`scripts/export-d1-recovery.py --source <private SQLite> --output <private SQL>`
reads SQLite read-only, validates schema/integrity, preserves IDs/tokens, converts
native Prisma DateTime milliseconds to D1 UTC text, and includes all D1 migrations
and their Wrangler migration ledger. OAuth `expires_at` remains integer seconds.
The output directory must be private and the output must not already exist.

**Import only into an empty disposable target.** The export creates application
tables and fails rather than overwriting them. Do not apply the initial migrations
before importing. After import, `wrangler d1 migrations list` should show the
included migrations as applied. Never print the SQL or command errors containing
it; retain import logs privately. A failed partial import requires inspection and
an explicitly authorised fresh target, not blind retry or table deletion.

The existing local test state predates the export's migration-ledger fix: its
0002/0003 schemas were applied separately. Do not confuse that mutable test state
with the immutable recovered SQLite or a newly exported empty-target restore.

A fresh local D1 import of `restore-d1-complete.sql` was also executed under the
private `export-smoke-state` directory. It reports 3 users, 3 accounts, 0 projects,
0 PDF jobs and 0 rate-limit buckets; foreign-key check is empty and Wrangler
reports **No migrations to apply**. D1 disallows `PRAGMA integrity_check`; SQLite
source/export validation supplies that check instead.

## Acceptance evidence

Executed in local workerd with copied records and private synthetic JWTs:

- Image/template upload, owner-only image access and wrong-owner denial.
- D1 project create/read/update/delete, timestamp round-trip and wrong-owner 404.
- Custom-font merged PDF, individual PDF generation and ZIP download; signed
  downloads succeed and tampered signatures fail.
- A paused 50-row PDF job survives a complete service restart; resume plus cron
  completes all rows without duplicate results or failures.
- Upload rate limits survive the same restart (six accepted, seventh 429).
- The editor loads a synthetic saved project/image/table and survives reload
  with its account guard intact.

Synthetic sessions do **not** verify Google sign-in. Synthetic localStorage does
**not** recover real users' projects from their original browser profiles.
Signed download URLs are transferable capabilities; possession by a different
authenticated account is not itself an owner-check failure.

SES `GetSendQuota` succeeded read-only (14 recipients/second, 50,000/day).
No email has been sent.

Remote staging checks passed for authenticated D1-backed sessions, upload,
owner-only templates (wrong owner 403), project create/read (wrong owner 404),
custom-font merged PDFs (two parsed pages, embedded GreatVibes), individual PDFs,
ZIP contents (two one-page PDFs), signed downloads and tamper rejection (403).
The admin archive listing contains 2,595 objects; admin downloads succeed while
ordinary users receive 403. Synthetic browser imports return confirmed client
IDs and replay without duplicates. Concurrent identical bulk submissions persist
and charge three recipients, not six. PDF and paused preview-mail queues survive
a fresh Worker deployment. Cron completed all 50 unique PDF results and all three
preview emails with zero failures. A rate-limit bucket also survived redeployment:
six requests reached method rejection, the seventh returned 429, and the same
429/reset remained after deployment.

Capacity checks admitted 500 attachment recipients, rejected 501 with 413, and
cancelled all 500 without dispatch. A custom-font merged PDF parsed as exactly
500 pages (28,940,064 bytes). Tail reported no exceptions; that render consumed
13,199 ms CPU / 21,313 ms wall time. The 500-recipient admission took 100,606 ms
wall time / 927 ms CPU. These are measured cases, not a worst-case large-background
or memory-headroom guarantee.

Browser testing reproduced a startup restore bug: without a local session the
saved table was not loaded and autosave could overwrite it empty. Startup now
loads saved recipient rows before enabling autosave, while retaining a fresh
browser working session when present. A real-table-hook regression test fails
without this fix. On deployed staging, a browser with no working-session copy
restored the saved image, field and recipient row after reload; Generate produced
one individual certificate. Final screenshots and the interaction recording are
under `.amp/in/artifacts/`. The recovered source records are untouched by
synthetic tests.

The Google sign-in route generates the correct staging callback, but Google
responds with **`redirect_uri_mismatch` / Access blocked**. No shared Google client
configuration was changed. Synthetic JWTs verify app authorisation, not OAuth.

## Remaining verification after authorised cutover

YJ explicitly chose production cutover rather than further staging approval
gates. These are remaining verification limits, not an outstanding request for
staging or cutover approval:

1. **Google OAuth:** production uses the existing callback and reaches Google's
   normal sign-in form without a redirect mismatch. An actual human sign-in is
   still required to verify the code exchange and return to the editor. No Google
   client configuration was changed; no credential belongs in chat.
2. **Live mail:** production has recovered SES credentials for ordinary user mail;
   no delivery test was sent. Testing arbitrary recipients still needs separate
   approval. Staging continues to write private previews only.
3. **Browser projects:** obtain user-assisted recovery of original-origin
   localStorage where needed. Keep browser copies until the existing import API
   confirms their `importedIds`; the server snapshot contains none of them.
4. **Runtime capacity:** confirm the account's Workers plan and worst-case
   CPU/memory headroom beyond the measured 500-row case. Current official limits
   allow 64 MiB uncompressed on both plans,
   with no compressed-size limit; the roughly 17 MiB bundle fits. Free CPU is
   10 ms, while Paid minute-cron CPU is 30 seconds. Package size is not proof
   that a paid plan is needed or available. Worker settings report `standard`,
   but billing-plan access returned 403. No billing change is authorised.

## Staging, cutover and rollback boundary

Recheck Cloudflare identity/account/target before every remote write. The approved
resources already exist; do not reimport the recovered schema into populated D1
or overwrite the private archive. Use forward migrations for later schema changes.
Provision staging secrets through private input without logging values. Account,
Worker, D1 and private R2 bindings must match `wrangler.jsonc`; never substitute
production resources discovered at runtime.

Complete remaining production verification with a human Google sign-in,
authorised mail testing and worst-case CPU/memory limits.
Remote copied-data, redeployment recovery, duplicate admission, capacity,
rate-limit and admin-access checks above have passed; synthetic sessions do not
close the real OAuth gate.
Record the exact candidate and deployed version. Do not treat a successful
upload or CLI deployment as an app-level restore test.

The authorised production plan and executed DNS/TLS change are recorded in
[CLOUDFLARE_PRODUCTION.md](CLOUDFLARE_PRODUCTION.md). Preserve old source, config,
SQLite, storage and backups. The stopped old service is not a working rollback:
reverting DNS alone does not restore it. Reconcile production D1/R2 writes before
any database/source rollback. Do not delete staging or source data as part of a
failed rollout without explicit approval.
