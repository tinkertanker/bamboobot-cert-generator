# TODOs

User tiers, feature gating, usage logging and the core admin pages
(`pages/admin/*`, `lib/server/tiers.ts`, `lib/server/middleware/featureGate.ts`)
are implemented. The items below are still open.

## Top priority

- [x] First test-quality cleanup: isolate destructive cleanup and progressive-session fixtures, test real PDF output, unmask validation failures, consolidate font/UI echoes, and keep Node/Workers build checks outside Jest
- [ ] Continue test-quality audit follow-ups: real autosave/load/save persistence and targeted replacements for remaining mock-heavy tests; retain security, D1 and import data-loss coverage
- [ ] CSV7 follow-ups ([per-row dispositions](docs/CSV7_FINDINGS.md))
  - [x] Atomic project create/import quota across Node and D1, preserving partial-import confirmations (row 3)
  - [x] Quarantine unknown-owner legacy browser data and block restoration on isolation failure (row 7)
  - [ ] Ownership-verified recovery for quarantined legacy browser data, without arbitrary-account adoption
  - [ ] Enforce PDF parser decoded-stream/object budgets; reported image-fallback and remote-URL entrances are closed (rows 12, 15)
  - [x] Durable pre-upload R2 staging reservations and reconciliation for ambiguous D1 outcomes (row 19; rollout and legacy drain still require separate approval)
- [x] Approval-gated agent API with scoped keys, unattended jobs and individual/ZIP downloads (see docs/AGENT_CERTIFICATES.md)
- [x] Agent batch discovery on the landing page, README and Agent access onboarding, with API examples and privacy/retention guidance
- [ ] Complete post-launch verification of the [Cloudflare migration](docs/CLOUDFLARE_PRODUCTION.md)
  - [x] Local OpenNext/D1/private R2 target, recovery export and hash-verified R2 backup
  - [x] Local restore checks for upload, projects, PDF/ZIP, durable PDF progress and HTTP rate limits
  - [x] Durable email dispatch, provider-wide limits and exactly-once quota refunds
  - [x] Workers cleanup adaptation and bounded object-expiry scheduling
  - [x] Approved admin-only archive: 4 scoped orphans and 2,591 historical-unscoped assets, copied and hash verified
  - [x] Approved isolated staging resources; copied D1 restore and remote upload/project/PDF/ZIP/admin checks
  - [x] Remote redeployment recovery for 50 PDFs, preview mail and rate limits; 500-row PDF and mail-admission boundary checks
  - [x] Browser startup restore regression fixed and deployed reload/generation verified
  - [x] Authorised production cutover with clean recovered-data import, TLS/auth gates and recorded rollback plan
  - [x] Compare all 400 original cutover source inventory files; runtime hashes match, five later documentation/comment differences recorded
  - [ ] Human production Google sign-in/code exchange, original-browser project recovery and authorised mail-delivery verification
  - [ ] Worst-case CPU/memory headroom beyond the measured 500-row case (owner confirms Workers Paid)
- [ ] Email download links for client-side PDFs (see below)
- [ ] Settings page, reachable from the avatar dropdown (currently a disabled "coming soon" item)
  - [ ] Default PDF generation method (client/server)
  - [ ] Default email configuration
  - [ ] UI preferences (theme, layout)
  - [ ] Account management options

### Email download links for client-side PDFs

With client-side PDF generation, email attachments work but download links do
not, because the PDFs never reach cloud storage. To support links:

1. When "Download Link" is selected with client-side PDFs
2. Upload each PDF to cloud storage (R2/S3) via a new API endpoint
3. Get back the URL
4. Send that URL in the email

This adds complexity and gives back some of the server-load savings of
client-side generation, so it is deferred until there is a clear need. The user
would choose this in the summary modal shown when they click Generate.

## Admin follow-ups

- [ ] Bulk user actions (upgrade multiple users, clean up old accounts)
- [ ] Export user data for analysis
- [ ] Transfer project ownership
- [ ] Usage reports: top users, growth (new users, upgrades, churn), estimated costs by feature
- [ ] System health alerts: storage limits, email provider quota, error rates, API latency
- [ ] Automated age-based project cleanup with warnings
- [ ] Support tools: admin notes, user impersonation (with audit log), diagnostic bundle export
- [ ] Per-tier feature flags / kill switches

## UX

- [ ] Data validation: highlight empty required cells, validate email format, detect duplicates
- [ ] Friendlier error messages with "Try again" actions and suggested fixes
- [ ] Entry jump navigation (go to a specific row)
- [ ] Tooltip improvements

## Performance

- [ ] Performance monitoring utility for measuring optimisations

## Refactoring follow-ups

- [ ] Modernise the existing Playwright suite for `/app`, tutorial dismissal, the developer-tools disclosure and current accessible controls. Keep the failing legacy suite visible until its replacement exercises the same workflows.
- [ ] Split editor orchestration (`pages/app.tsx`) and bulk-email state (`BulkEmailModal`) along lifecycle boundaries, with end-to-end coverage for cancellation, project restore and PDF/email handoff before moving effects.
- [ ] Review Node/Workers job-queue duplication separately. Preserve durable admission, leases, quota refunds and ambiguous-delivery semantics; these are intentional platform differences, not interchangeable implementations.
- [ ] Apply the documented file naming convention to remaining legacy utility filenames when their owning areas next change; avoid a repository-wide path-only rename.
