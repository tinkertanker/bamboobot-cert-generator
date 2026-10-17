# Deploying with Docker

Production runs as a single container behind an nginx-proxy on the external Docker network `devtksg`. See `docs/ENVIRONMENT_SETUP.md` for how `.env` is used and `docs/NGINX_CONFIGURATION.md` for upload size limits.

## First-time server setup

The container runs as UID 1001 and mounts host directories from `./data`. Create them before the first start. The database file must exist as a file, or Docker creates a directory in its place.

```bash
sudo mkdir -p data/{temp_images,generated,template_images}
sudo touch data/database.db
sudo chown -R 1001:1001 data
cp .env.example .env   # then edit
```

Settings that matter for production (all documented in `.env.example`):

```bash
PRODUCTION_HOST=your-production-domain.com
CERT_NAME=your-production-domain.com          # or a shared wildcard certificate name

NEXTAUTH_URL=https://your-production-domain.com   # not http://localhost:3000
NEXTAUTH_SECRET=...                           # openssl rand -base64 32
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

REQUIRE_AUTH=true                             # runtime; defaults to on in production
SUPER_ADMIN_EMAILS=admin@yourdomain.com
ADMIN_DOMAINS=yourdomain.com

CLEANUP_SECRET_KEY=...                        # needed for scheduled R2/S3 cleanup
```

`DATABASE_URL` is set by `docker-compose.yml` (`file:./database.db`, resolved from `prisma/schema.prisma`, so the file is `/app/prisma/database.db`). You do not need it in `.env` for Docker.

`NEXT_PUBLIC_PROJECT_SERVER_PERSISTENCE` is inlined into the browser bundle at build time, and `.env` is excluded from the Docker build context, so setting it in `.env` does not switch on server persistence for projects. Projects stay in each user's browser.

In Google Cloud Console, set:
- Authorised JavaScript origin: `https://your-production-domain.com`
- Authorised redirect URI: `https://your-production-domain.com/api/auth/callback/google`

## Deploying an update

```bash
./scripts/deploy.sh          # git pull, rebuild with --no-cache, restart
./scripts/deploy.sh --logs   # same, then follow logs
```

`docker-entrypoint.sh` creates the database schema only when `database.db` is empty. **After any change to `prisma/schema.prisma`** (check `git log -- prisma/schema.prisma`), apply it to the existing database once the container is up:

```bash
docker compose exec bamboobot npx prisma db push
```

## Scheduled cleanup

With R2 or S3 storage, run `scripts/storage-cleanup.sh` daily from cron; see "Cloud Storage Cleanup" in `README.md`. Try it with `CLEANUP_DRY_RUN=1` first.

## Checking a deployment

```bash
docker compose ps
docker compose logs -f
ls -la data/database.db            # owned by 1001:1001
docker network inspect devtksg     # container is attached
```

Then open `https://your-domain.com/` (landing page), sign in, and check `/app` loads.

## Troubleshooting

- **Permission errors in logs:** `sudo chown -R 1001:1001 data && docker compose restart`.
- **Database not persisting:** check `data/database.db` is a file owned by 1001:1001, and `docker compose exec bamboobot ls -la /app/prisma/` shows it.
- **Sign-in fails:** `NEXTAUTH_URL` must be HTTPS and match the domain exactly, and the Google redirect URI must match.
- **Large uploads fail:** see `docs/UPLOAD_TROUBLESHOOTING.md`.

## Rolling back

```bash
git checkout <previous-good-commit>
docker compose build --no-cache
docker compose up -d
```

Schema changes are additive so far, so an older build can usually run against a newer database. Check `prisma/migrations/` if unsure.
