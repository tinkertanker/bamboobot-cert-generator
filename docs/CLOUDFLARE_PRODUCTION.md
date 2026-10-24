# Bamboobot production cutover

## Recovered source provenance — 24 October 2026

The migration source integrated into `feat/agent-certificate-batches` was
recovered from `/tmp/bamboobot-live-review`: 73 files from the archived recovery
thread's latest Changes snapshot over base `7896c438`, not an immutable cutover
checkout. The original capture and app archive are preserved privately. All 400
files in the original cutover inventory have been compared against the recovered
capture and unchanged base (including the two recovered dev-template assets).
None is missing. All runtime source hashes match; only five documented later
documentation/comment files differ: `.env.example`, `README.md`, `TODO.md` and
`docs/CLOUDFLARE_{MIGRATION,PRODUCTION}.md`. The recorded source fingerprint is
`ea3e75e8cb0d82f4c3aa46bf9a3e1eff5ada943b82b5b17cd97ead2094849fa3`.
Read-only provider inspection found production version
`a53d82ac-e750-4133-8e41-fe469a215789` at 100% traffic, retaining the original app
upload `57deadca-9d75-4c78-af9d-1eb55b80b474`. These bind the recovered runtime
baseline to the cutover, not this newly modified agent-feature working tree.
Historical checks below are recovered records, not new-candidate acceptance.
The port itself does not authorise deployment or external changes.

### Supported runtime dependency reconciliation

The recovered lockfile resolved Next.js 15.5.28, whose major-version support
window has expired. OpenNext's support-policy rejection was not bypassed.
The integrated branch pins stable Next.js 16.4.3 with the recovered OpenNext
1.20.12 adapter, whose declared peer range permits Next.js >=16.4.1. React and
React DOM remain on 18.3.1 for the Pages Router; NextAuth 4.24.15 permits Next 16.
Explicit `--webpack` flags preserve the previous bundler rather than adopting
Next 16's Turbopack default. The removed `next lint` command and Next config
`eslint` option are replaced by a separate ESLint CLI invocation. The existing
ESLint 9 / eslint-config-next 15 legacy configuration is intentionally retained,
as permitted by the Next 16 upgrade guide; no new lint rules are silently adopted.
This is a new runtime candidate, not the previously deployed cutover artifact.

## Authority and candidate

YJ authorised the production Worker/data/bindings/secrets and hostname cutover on
20 October 2026, superseding the earlier staging-only boundary. This does not
authorise Git push/merge, billing changes, arbitrary live-mail test recipients,
or deletion of staging, source data or backups. Staging OAuth changes are skipped.

The candidate is the local migration working tree based on
[`7896c43`](https://github.com/tinkertanker/bamboobot-cert-generator/commit/7896c438a07e4ee786d88a035ce9e3759afd7168),
not a landed migration commit. The migration passed 109 suites / 901 tests, lint,
Node/OpenNext builds, remote copied-data checks and an independent audit covering
correctness, security/privacy and compatibility/operability. The production
configuration is separate; default Wrangler commands still select staging.

## Exact boundary

- Account: Tinkertanker, `b8b1032c61d9475cd00229c74db7ec72`.
- Zone: `tk.sg`, `ea01004f470a0e8078f1b9fdef547273`.
- Worker/D1: `bamboobot`; D1 ID `14c7642a-6947-4f7a-a2a3-b8273e6a63b2`.
- Private R2: `bamboobot-files`; no public bucket endpoint/custom domain.
- Production app: `https://bamboobot.tk.sg`; no workers.dev or preview entry.
- Recovered Google client and NextAuth/signing configuration are retained.
- Recovered SES configuration enables ordinary user-requested production mail;
  no synthetic mail job or arbitrary-recipient delivery test is authorised.
- D1 is imported from the immutable recovered SQLite, never staging D1.
- Only the hash-verified recovery archive is copied from staging R2: four scoped
  orphans and 2,591 historical-unscoped assets, all admin-only. No staging jobs,
  users, projects, generated fixtures or test sessions are production data.

```sh
BAMBOOBOT_RUNTIME=workers NEXT_PUBLIC_PROJECT_SERVER_PERSISTENCE=true \
  npx opennextjs-cloudflare build --config wrangler.production.jsonc
npx wrangler deploy --config wrangler.production.jsonc --dry-run \
  --outdir /tmp/bamboobot-production-worker
# Only after fresh identity, target, data, DNS and rollback checks:
npx wrangler deploy --config wrangler.production.jsonc \
  --secrets-file <private-recovered-production-secrets.json>
```

The supported TT bearer credential is supplied through Wrangler's environment,
never an argument. Secret files, imports, object inventories and raw receipts
remain under `/home/user/.private/bamboobot-recovery`, directories 0700/files 0600.
Do not publish those files or use public artifact URLs to transfer them.

## Pre-cutover state and rollback

Recorded before mutation: DNS record ID `dfe24aa6cb7526875ddd241fab2c9a03`,
type `CNAME`, name `bamboobot.tk.sg`, content `office.tk.sg`, `proxied=false`,
TTL `1` (automatic). There was no matching Worker route or custom domain and no
production Bamboobot Worker/D1. The full DNS/route snapshot is retained privately
in `production-preflight-summary.json`. The old container was already stopped,
exit 255, and the old hostname failed TLS; diagnostic nginx returned 503.

**Reversing DNS is not service recovery.** Do not restore the old CNAME and claim
rollback succeeded. Native source-service/TLS recovery must first be separately
prepared and verified, without overwriting source edits/configuration/data.

For a regression, prefer a forward fix on the preserved production bindings.
For integrity/security risk, stop writes with a maintenance response, preserve a
fresh D1 export and R2 write delta, then repair or restore service deliberately.
Do not roll the Worker back to its temporary archive-copy implementation. Keep
the last verified app artifact/version for subsequent application rollback.
Before any later database rollback, reconcile writes accepted after cutover;
reimporting the recovered snapshot would lose them. Removing a domain or changing
DNS must be scoped to this hostname and checked against its current provider state.
No rollback deletes source, staging, archives or backups.

## Bounded launch checks

Before routing traffic: verify the clean recovered D1 counts/relationships,
absence of synthetic jobs/identities, all archive hashes and private bucket access.
Recheck the source R2 inventory against the verified backup; a delta requires a
new private backup before proceeding.

After routing: check provider deployment/domain/bindings, DNS and verified TLS,
landing/app/API auth gates, static assets, Google callback construction and the
Google sign-in page. Check logs and D1 integrity/counts within a bounded window.
Hold for any ownership bypass, data mismatch or sustained application 5xx; do not
claim Google account login, delivered mail or worst-case capacity from basic
health checks. An actual human Google sign-in is required to close OAuth, and
original-browser localStorage recovery remains user-assisted.

## Executed outcome — 20 October 2026

Production is serving `https://bamboobot.tk.sg`, 100% on Worker version
`a53d82ac-e750-4133-8e41-fe469a215789`. The app upload first created version
`57deadca-9d75-4c78-af9d-1eb55b80b474`; removing the temporary `RESTORE_KEY`
created the final version. The import code and staging-source binding are no
longer active. workers.dev and preview URLs are disabled.

Wrangler uploaded the app but initially refused the custom domain because the
old CNAME was externally managed. After rechecking its exact saved identity, only
that CNAME was removed and replaced by the app's custom domain. Current DNS is a
Cloudflare-managed proxied `AAAA` record, content `100::`, TTL automatic. Domain
ID is `9b7aa1174a3261ccef4ebace7597ded59c125562`; it is enabled for Worker
`bamboobot`, environment `production`, with preview URLs disabled.

- Normal TLS changed from curl exit 60 / verification result 18 to **HTTP 200 /
  verification result 0**, without certificate bypass.
- All 2,595 assets / 1,678,733,878 bytes were copied with source and destination
  SHA-256 plus metadata verification. Production's bucket contained exactly that
  archive, no staging fixtures; public access is disabled and there are no R2
  custom domains. The original 2,551-object production R2 inventory was unchanged
  relative to its verified independent backup immediately before import.
- The source-only D1 import exactly matched every recovered User/Account field.
  Both before and after cutover: 3 users, 3 accounts, 0 projects/PDF jobs/email
  jobs/items/submissions/ingestions, zero foreign-key violations. All five
  migrations are recorded as applied. No staging D1 data was imported.
- Thirteen production HTTP checks passed: TLS landing, app/API login gates,
  browser PDF worker/font assets, production Google callback, D1-backed session
  and project read, admin archive listing/hash-matched attachment, unauthenticated
  archive denial and Google authorisation redirect/page. The authenticated probe
  used a five-minute signed cookie for an existing recovered admin, not a test
  identity or completed Google login. It inserted no production fixture.
- A real browser click reached Google's normal **Sign in to tk.sg / Email or
  phone** form, not `redirect_uri_mismatch`. No Google client was changed and no
  credentials were entered. Inspected landing/Google captures are under
  `.amp/in/artifacts/`.
- A bounded 180-second tail captured **43 events, all `ok`, zero exceptions**;
  maximum CPU 386 ms / wall 3,016 ms. These were HTTP events. The minute cron is
  configured, but no scheduled invocation appeared in that observation window.

The pre-cutover source inventory SHA-256 is
`ea3e75e8cb0d82f4c3aa46bf9a3e1eff5ada943b82b5b17cd97ead2094849fa3`.
The preserved OpenNext artifact archive SHA-256 is
`e4c0aed1a3a0c6e9b2bc4b46e19fe12d3e0c27a9c667a0390c5e59b2954f0bef`.
Post-launch documentation edits do not change that deployed runtime artifact.
Private receipts are `production-{preflight-summary,archive-verification,
d1-verification,cutover-verification,app-verification,launch-tail-summary}.json`
and the preserved artifact/import/configuration files in the recovery directory.

**Human action:** open production in the original browser, sign in with Google,
and confirm return to the editor. Browser project recovery/import, complete
Google code exchange, delivered mail and worst-case production capacity are not
yet verified. Recovered SES credentials are bound for ordinary user mail, but no
test email was sent. Account billing-plan access remains unavailable; no billing
change was made. Code remains uncommitted/unpushed; nothing was merged. Staging,
the stopped source service, its edits/data/configuration, backups and this orb
remain preserved.
