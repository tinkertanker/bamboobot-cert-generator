# Deploying to Cloudflare Workers

Bamboobot runs as a single Cloudflare Worker built with [OpenNext](https://opennext.js.org/cloudflare). It needs the Workers Paid plan (Durable Objects, the 5-minute CPU limit and the bundle size).

Everything the Worker uses is declared in `wrangler.jsonc`:

| Binding | Resource | Used for |
| --- | --- | --- |
| `DB` | D1 database `bamboobot` | Users, sessions, tiers, usage, projects (Prisma) |
| `FILES` | R2 bucket `bamboobot-files` | Uploaded templates, generated PDFs, queued email attachments |
| `EMAIL_QUEUE` | Durable Object `EmailQueueObject` | One bulk email queue per user |
| `ASSETS` | Static assets | `public/` files, including the PDF fonts |
| `RATE_LIMIT_*` | Workers rate limiting | Per-route request limits |
| `WORKER_SELF_REFERENCE` | This Worker | OpenNext, and quota refunds from the email queue |
| cron `0 2 * * *` | Scheduled trigger | Daily deletion of expired R2 files |

## First deployment

Run these from the repository root after `npm install`, logged in with `npx wrangler login` (or with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` set).

1. Create the database and bucket:

   ```bash
   npx wrangler d1 create bamboobot
   npx wrangler r2 bucket create bamboobot-files
   ```

   Copy the `database_id` that `d1 create` prints into the `d1_databases` entry in `wrangler.jsonc`. (Recent Wrangler versions can also create both on the first deploy if the ID is left out.)

2. Create the tables:

   ```bash
   npm run db:migrate:remote
   ```

3. Set secrets (each command prompts for the value):

   ```bash
   npx wrangler secret put NEXTAUTH_SECRET        # openssl rand -base64 32
   npx wrangler secret put NEXTAUTH_URL           # https://your-domain.com
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put CLEANUP_SECRET_KEY     # any long random string
   npx wrangler secret put SUPER_ADMIN_EMAILS
   npx wrangler secret put ADMIN_DOMAINS
   # Email: either Resend...
   npx wrangler secret put RESEND_API_KEY
   # ...or Amazon SES
   npx wrangler secret put AWS_ACCESS_KEY_ID
   npx wrangler secret put AWS_SECRET_ACCESS_KEY
   npx wrangler secret put AWS_SES_REGION
   npx wrangler secret put EMAIL_FROM
   ```

   `NEXTAUTH_SECRET` is required: besides signing sessions and download links, it derives the key the email queue uses to call back into the Worker. Other optional settings are listed in `.env.example`.

4. Build and deploy:

   ```bash
   NEXT_PUBLIC_PROJECT_SERVER_PERSISTENCE=false npm run deploy
   ```

   `NEXT_PUBLIC_PROJECT_SERVER_PERSISTENCE` is inlined into the browser bundle, so it must be set in the environment that runs the build (or in `.env`). Changing it needs a rebuild and redeploy. When it is `true`, projects are stored in D1 and signed-in users are offered an import of projects saved in their browser; each browser copy is deleted only after the server confirms it was saved.

5. Point the domain at the Worker: in the dashboard, Workers > bamboobot > Settings > Domains & Routes > add a custom domain. Then, in Google Cloud Console, set:
   - Authorised JavaScript origin: `https://your-domain.com`
   - Authorised redirect URI: `https://your-domain.com/api/auth/callback/google`

## Deploying an update

```bash
npm run deploy
```

If `prisma/schema.prisma` changed, the same change needs a new SQL file in `migrations/`, applied with `npm run db:migrate:remote` before deploying. `npx wrangler d1 migrations list bamboobot --remote` shows what has been applied.

## Moving from the Docker deployment

Files on the old server are not carried over: templates and generated PDFs expire anyway, and users can re-upload a template. Links in emails sent from the old server stop working once its domain points at the Worker.

The old SQLite database is also not imported. Users are recreated when they next sign in and admin tiers come back from `SUPER_ADMIN_EMAILS` and `ADMIN_DOMAINS`. Tiers set by hand in `/admin/users`, usage counts and server-saved projects (only used when server persistence was on) would need to be set again. If they matter, the rows can be exported with `sqlite3` and loaded with `npx wrangler d1 execute bamboobot --remote --file <dump.sql>`, but check the date columns first: Prisma's old SQLite engine and D1 may store them differently.

## Checking a deployment

```bash
npx wrangler tail                      # live logs
npx wrangler d1 execute bamboobot --remote --command "SELECT count(*) FROM User"
curl -X POST -H "X-Cleanup-Key: $CLEANUP_SECRET_KEY" "https://your-domain.com/api/cleanup-r2?dryRun=1"
```

Then open `https://your-domain.com/` (landing page), sign in, and check `/app` loads. `/admin/system` shows D1 and R2 status.

## Troubleshooting

- **Sign-in fails:** `NEXTAUTH_URL` must be HTTPS and match the domain exactly, and the Google redirect URI must match.
- **Bulk emails send but quota is never returned for failures:** check `NEXTAUTH_SECRET` is set and the `WORKER_SELF_REFERENCE` service name matches the Worker name.
- **Expired files are not deleted:** check `CLEANUP_SECRET_KEY` is set; the cron logs "Skipping storage cleanup" without it. Cron runs appear in `wrangler tail` and in the dashboard under Logs.
- **Uploads over 10 MB fail:** raise `MAX_UPLOAD_SIZE`. Workers accept request bodies up to 100 MB on the Paid plan.

## Rolling back

```bash
npx wrangler deployments list
npx wrangler rollback <deployment-id>
```

Rolling back the code does not undo D1 migrations. Migrations so far only add tables and columns, so an older build can run against a newer database.
