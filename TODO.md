# TODOs

User tiers, feature gating, usage logging and the core admin pages
(`pages/admin/*`, `lib/server/tiers.ts`, `lib/server/middleware/featureGate.ts`)
are implemented. The items below are still open.

## Top priority

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
