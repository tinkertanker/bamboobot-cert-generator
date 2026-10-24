# Agent certificate batches (v1)

An external agent supplies recipient JSON and a layout. Bamboobot renders actual
sample PDFs, the signed-in owner approves them, and durable unattended work
publishes individual PDFs and a complete ZIP without an open browser. Production
uses the existing Cloudflare Worker, minute cron, D1 and private R2. Local Node
development can instead use the separate SQLite/filesystem worker. There is no
hosted language model, MCP server, email sending or automatic approval.

## Cloudflare runtime

`BAMBOOBOT_RUNTIME=workers` is selected at build time. Set the non-secret runtime
binding `AGENT_CERTIFICATES_ENABLED=true` only after the additive
`0006_agent_certificates.sql` migration and release acceptance. The default
Wrangler configuration targets staging; production always needs explicit
`--config wrangler.production.jsonc`. Existing D1/R2 identities, OAuth secrets,
user/project data and the minute cron stay in place. Do not replay the original
cutover/import instructions or provision replacements. Do not revive Docker.

Creation reserves capacity atomically in D1 before accepting private R2 bytes.
An interrupted upload can be resumed with the same idempotency key. Jobs then
enter `preparing`; cron preflights every row through the strict shared renderer
in bounded slices, checkpointing each private PDF. A stopped isolate loses at
most its current object write; the five-minute lease and attempt fence permit
recovery without a browser request. The sample becomes available only after all
rows pass. Poll until `awaiting_approval` before presenting the approval link.

Approval is one conditional D1 statement with a quota trigger: a zero-row replay
neither queues again nor charges again. After approval, cron verifies every
retained PDF's hash while streaming a ZIP STORE archive into multipart R2 (5 MiB
parts). It publishes the manifest only after every entry and the ZIP exist.
Those are the same bytes preflighted before approval, not a second rendering.
Missing/corrupt objects fail the whole job, never produce a skip-failed archive.
No Prisma interactive transaction or isolate-local admission gate is used here.

Workers templates are limited to **4 MB / 4 megapixels**, individual PDFs 8 MiB,
and the individual-output sum and ZIP each 250 MiB. These bounds protect the
128 MB isolate; representative resource acceptance is still required. Three
pending jobs per owner, eight globally and 2 GiB reserved/published storage apply
atomically. Each preparing job reserves 660 MiB, so at most three can be in
preparation globally at once, regardless of size. Ready jobs release unused
headroom and reserve their retained inputs/PDFs plus the future ZIP; completed
and failed jobs charge retained bytes rather than unused preparation capacity.
One persisted lease bounds agent decoding across all isolates. Preparation uses
a twenty-second wall-clock slice after template loading, plus its final
indivisible render. Minute scheduling and storage latency affect batch duration;
the browser is not the scheduler.
Transient failures retry on a later cron, up to three failures/interrupted
leases. Expiry/DELETE revokes downloads immediately. A bounded R2 sweep performs
retryable physical deletion, including unreferenced old attempts; it is not an
instant erase. Keep cron enabled for unattended execution and retention.

This adds **no VM, Container, Durable Object or Queue service**. The owner has
confirmed Workers Paid already exists. Normal Workers CPU/requests, D1 and R2
usage still consume account-wide allowances and may incur overages; this is not
a zero-cost guarantee. A 500-file batch writes roughly 500 PDFs plus sample,
template and multipart ZIP objects; its actual sizes and CPU depend on design.
Alert the owner before adding separately billed infrastructure or likely
meaningful new overages. No plan upgrade is part of this feature.

Rollback disables agent intake and processing, then restores the preserved live
Worker version. Keep additive D1 tables and R2 objects/new user writes; code
rollback is not a database restore. Preserve the active bindings and secrets.

## Local setup

Use Node 22+, `npm ci`, `npx prisma generate`, then apply the additive schema to
your **local** database with `npx prisma db push`. Set `DATABASE_URL`,
`NEXTAUTH_SECRET`, `NEXTAUTH_URL` (the exact browser origin) and
`AGENT_CERTIFICATES_ENABLED=true`. Start `npm run dev` and, separately,
`npm run agent:worker`. Rebuild with `npm run build:agent` after worker changes.
Authentication is required on agent routes even if `REQUIRE_AUTH=false`.

Open **Agent access** in the account menu (`/agent`) to create a key. Tokens are
shown once, stored only as hashes, expire after 30 days and can be revoked. Keys
have `certificates:read` and/or `certificates:write` scope. Neither scope permits
approval or key management. Keep tokens in the agent's secret store, never in
prompts, source, URLs or logs. No Google access token is accepted as an API key.

## External-agent workflow

1. POST `/api/agent/jobs` with `Authorization: Bearer <key>`, JSON Content-Type
   and a unique `Idempotency-Key` (1–100 letters/digits/underscores/hyphens).
2. On Workers, poll while `status=preparing`; preparation continues without a
   browser. When ready, inspect `job.sampleUrl` (actual PDF), or the template at
   `/api/agent/jobs/<id>?artifact=template`. Join relative URLs to the app origin.
   Owners can download all frozen recipient inputs through `job.inputUrl` before
   approving; sample page numbers and row IDs are shown on the review page.
3. Give the owner `job.approvalUrl`. Only the owner session can POST
   `{ "action": "approve", "inputHash": "<returned hash>" }` to
   `/api/agent/jobs/<id>`, from the configured app origin. Approval atomically
   queues the job. API keys cannot perform this step, even if a cookie is present.
4. Poll GET `/api/agent/jobs/<id>` sparingly (e.g. every 3 seconds). When status
   is `completed`, download `files[].url`, `zipUrl` and `manifestUrl` with the key.
   Downloads always authenticate ownership; there are no public/share links.

Example request body (omit `template` to use the landscape default preset):

```json
{
  "label": "Workshop certificates",
  "rows": [
    {"id": "recipient-001", "fields": {"Name": "Ada Lovelace", "Course": "Creative computing"}},
    {"id": "recipient-002", "fields": {"Name": "Grace Murray Hopper", "Course": "Creative computing"}}
  ],
  "positions": {
    "Name": {"x": 50, "y": 47, "width": 75, "fontSize": 34, "alignment": "center", "fontFamily": "Poppins"},
    "Course": {"x": 50, "y": 65, "width": 75, "fontSize": 22, "alignment": "center"}
  }
}
```

Optional `template: {"base64": "<raw PNG/JPEG base64, no data: prefix>"}`
accepts at most 4 MB / 4 megapixels on Workers, or 10 MB / 12 megapixels on Node.
PNG dimensions are checked before decode.
Images preserve aspect ratio with a defined PDF width
(842 points landscape, 595 portrait); raw pixel dimensions are not print points.
The default contains only a border and “Certificate”: do not invent issuer,
award, date or course claims. CSV/XLSX conversion belongs in the external agent.

Positions use percentages from the top-left (0–100). `width` is also a percentage;
font sizes are relative to an 800-pixel reference, not a live browser viewport.
Supported styles are `fontFamily`, `fontSize`, `bold`, `italic`, `color` (#RRGGBB),
`alignment`, `textMode` (`shrink`/`multiline`) and `lineHeight`. Only explicitly
mapped fields are printed; ignored columns are reported separately. The agent
chooses placement; Bamboobot validates bounds, font/style availability, glyph
coverage, overflow and truncation for **every row** using the real renderer.
It cannot infer visual collisions with artwork, so owner review remains essential.

Inputs, filenames and template bytes are immutable. To change anything, create a
new draft and approve its new sample. Reusing an idempotency key with changed
inputs gives 409; replaying identical inputs returns 200 instead of 201. Deleted
or expired jobs retain their key: choose a new key (409), not a new payload.
GET `/api/agent/jobs` returns lightweight summaries; fetch an individual job for
its artifact links. First, longest aggregate mapped text and last rows are sampled;
the exact individual sample bytes are reused in the final batch. Rendering-source,
dependency-lockfile and font hashes bind approval; incompatible upgrades require
new drafts/approval.

## Shared guarantees and Node-specific operation

- 1–500 rows, 20 mapped fields, 50 input columns, 2,000 characters/value; at most
  1 MB recipient/layout JSON. Multiline is at most two lines; unsupported scripts
  fail explicitly rather than silently substituting missing glyphs.
  Mapped values containing Unicode format characters (including zero-width
  joiners, soft hyphens and bidi controls) are rejected, never silently stripped.
  v1 therefore does not support scripts that require such shaping controls.
- On Node only, preflight is synchronous, bounded to one minute. Expensive templates/fonts may
  require smaller batches; the row cap is not a promise that every 500-row batch fits.
  One web process prepares one draft at a time; concurrent callers receive 429
  and should retry with backoff and the same idempotency key. Do not scale the
  web process without adding a persisted preparation reservation.
- PDFs and ZIP are separately capped at 250 MB. Individual files repeat image
  resources, so large backgrounds can hit this limit well before 500 rows.
- Three pending jobs/owner, eight globally, 2 GiB reserved/published agent storage.
  On Node: one configured worker and a ten-minute attempt deadline. Keep at least 500 MB
  free for a batch. Existing request rate limits also apply.
- Quota preserves existing **one PDF batch per approval** semantics. Atomic
  approval charges once; duplicates, retries and worker restarts do not recharge.
  A failed approved job still counts as a batch attempt. No email quota is used.
- The Node worker claims a persisted job with an attempt token and five-minute lease.
  It restarts whole batches after a crash, up to three attempts; transient failures
  retry after five seconds. A stale worker cannot publish over a newer attempt.
- A job is complete only after every PDF, verified ZIP and manifest is written.
  ZIP entries contain the exact bytes served individually. No partial-success
  archive is offered. `failed` jobs expose an error, never partial download links.
- POST `{ "action": "retry" }` can retry a failed compatible job only while its
  three-attempt budget remains. DELETE `/api/agent/jobs/<id>` cancels publication
  and removes inputs/artifacts. Deletion is irreversible.
- Drafts expire after 24 hours; approved jobs seven days after approval. Downloads
  are denied immediately on expiry/deletion. The worker runs cleanup every minute,
  also removing abandoned attempts. **The worker must run for physical cleanup.**
- Node stores snapshots and artifacts in private local
  `storage/generated/agent_jobs`, even when the legacy app uses R2/S3. No cloud
  uploads or arbitrary URL fetches are performed. All replicas must share this
  filesystem and SQLite; this is a same-host deployment, not serverless compute.
- Recipient data leaves browser-local storage in this flow. Send only necessary
  fields. No names, tokens, artifact URLs or raw storage errors are logged.

## Legacy Node/Docker setup (not the production rollout)

Production already runs on Cloudflare. The following is only for separately
operated Node installations; it is not a rollback or deployment path for
`bamboobot.tk.sg`.

Use `docker-compose.yml` with `docker-compose.agent.yml`. The latter is opt-in:
it uses the same built image for Next and a Compose-supervised worker, with a
shared database **directory** at `data/agent-db` so SQLite journals are shared.
The override caps web memory at 1 GiB. It does not automatically migrate or copy
an existing database.

Before enabling, stop writers, back up the existing SQLite database and storage,
and copy the consistent database to `data/agent-db/database.db` with UID/GID 1001
write permissions on the directory. Do not copy a live SQLite file without its
WAL. Build the image, then run a **single**, explicitly authorised schema update:

```bash
docker compose -f docker-compose.yml -f docker-compose.agent.yml build bamboobot
docker compose -f docker-compose.yml -f docker-compose.agent.yml run --rm --no-deps --entrypoint npx bamboobot prisma db push --skip-generate
docker compose -f docker-compose.yml -f docker-compose.agent.yml --profile agent up -d
```

Review the schema diff before running against an existing database. Startup's
empty-database initialiser does not migrate existing databases. Ensure the app
and worker use the same image, database, generated-storage mount and origin.
SIGTERM lets the worker finish its current attempt (Compose grants 11 minutes);
forced termination is recovered after lease expiry. Do not scale the worker.

For rollback, disable intake, drain/stop the worker, and keep the new DB/storage
path when reverting application code; do not silently switch to the old stale DB.
Preserve additive tables and backups. Deleting them is not part of rollback.

## Verification

`npm test -- --runInBand __tests__/api/agent-certificates.test.ts` exercises real
SQLite, HTTP handlers, rendering, file streaming and ZIP extraction (with only
the owner-session boundary supplied by a fixture). The UI contract is covered by
`__tests__/components/AgentPage.test.tsx`. Run lint and a production build too.
`__tests__/lib/worker-certificates.test.ts` exercises native D1 atomic admission,
quota triggers, recovery, actual R2 objects and ZIP extraction. Release acceptance
must additionally run the exact OpenNext/workerd artifact, not only Node tests:
owner/PAT/nonowner denial, duplicate approval/quota boundary, interrupted-slice
recovery with no browser traffic, 500 individual PDF/ZIP entries and hashes,
missing-object failure, expiry, legacy upload/project/download paths and measured
CPU/memory headroom. An owner must approve real production samples; fixture
approval in local acceptance does not grant production approval.
For release qualification, use real NextAuth sessions and the bundled worker,
download PDFs/ZIPs, extract names/render pages, compare every entry hash, kill
and restart the worker mid-job, inject write failure, and test owner/key denial,
stale approval, expiry and cleanup. Test large backgrounds under actual disk,
memory and proxy timeout budgets before increasing workload.
