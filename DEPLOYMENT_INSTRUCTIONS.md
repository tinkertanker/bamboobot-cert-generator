# Deployment Instructions for Breaking Changes

## Critical Updates Since Commit 82dfa9e

### 1. Pre-deployment Server Setup

**IMPORTANT: Run these commands on your server BEFORE pulling the latest code:**

```bash
# Create data directories with correct permissions for UID 1001 (nextjs user in container)
sudo mkdir -p data/{temp_images,generated,template_images}

# Create empty database file (will be initialized by Prisma)
sudo touch data/database.db

# Set correct ownership for all data files
sudo chown -R 1001:1001 data
```

### 2. Update .env File

Update your server's `.env` file with these critical changes:

```bash
# Database (CRITICAL - must use prisma subdirectory for persistence)
DATABASE_URL="file:./prisma/database.db"

# Authentication (Required for production)
NEXTAUTH_URL=https://your-production-domain.com  # NOT http://localhost:3000
NEXTAUTH_SECRET=your_generated_secret  # Generate with: openssl rand -base64 32

# Google OAuth (if enabling auth)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Feature Flags
NEXT_PUBLIC_REQUIRE_AUTH=false  # Set to true when ready
NEXT_PUBLIC_PROJECT_SERVER_PERSISTENCE=false  # Enable server storage when ready

# Admin Configuration (if using auth)
SUPER_ADMIN_EMAILS=admin@yourdomain.com
ADMIN_DOMAINS=yourdomain.com
```

### 3. Google OAuth Configuration

If enabling authentication, update Google Cloud Console:
- **Authorized JavaScript origins**: `https://your-production-domain.com`
- **Authorized redirect URIs**: `https://your-production-domain.com/api/auth/callback/google`

### 4. Deployment Commands

```bash
# Stop current container
docker compose down

# Pull latest code
git pull

# Rebuild with no cache (important for Prisma)
docker compose build --no-cache

# Start the container
docker compose up -d

# Initialize database (run AFTER container starts)
docker compose exec bamboobot npx prisma db push

# Monitor logs
docker compose logs -f
```

### 5. Verify Deployment

1. **Check database creation:**
   ```bash
   ls -la data/database.db
   # Should see database.db file owned by 1001:1001
   ```

2. **Check container is running:**
   ```bash
   docker ps | grep bamboobot
   ```

3. **Check nginx-proxy network:**
   ```bash
   docker network inspect devtksg
   ```

4. **Test the application:**
   - Navigate to `https://your-domain.com/` - should see landing page
   - Navigate to `https://your-domain.com/app` - main application
   - If auth enabled, test Google sign-in

### 6. Troubleshooting

**Permission Issues:**
```bash
# If you see permission errors in logs
sudo chown -R 1001:1001 data
docker compose restart
```

**Database Issues:**
```bash
# If database isn't persisting
docker compose exec bamboobot ls -la /app/prisma/
# Should see database.db owned by nextjs user

# Check that the host file exists
ls -la data/database.db
# Should be owned by 1001:1001
```

**Auth Issues:**
- Ensure `NEXTAUTH_URL` uses HTTPS and matches your actual domain
- Check Google OAuth console for correct redirect URIs
- View auth logs: `docker compose logs -f | grep auth`

### 7. Rollback Plan

If issues occur:
```bash
# Stop new container
docker compose down

# Restore previous version
git checkout 82dfa9e

# Rebuild and restart
docker compose build --no-cache
docker compose up -d
```

## Summary of Breaking Changes

1. **New Dependencies**: Prisma, NextAuth, SQLite database
2. **Route Changes**: App moved from `/` to `/app`
3. **Database Required**: SQLite database must be initialized
4. **Volume Changes**: New volume mount for database.db file
5. **Environment Variables**: Several new required variables
6. **Permissions**: Data directories and database file must be owned by UID 1001

## Notes

- The worker file copy issue has been fixed (removed redundant COPY)
- Database location fixed to use `./prisma/database.db` for persistence
- Only the database file is mounted (not the entire prisma directory) to preserve schema.prisma from the image
- All data directories and files must be created with UID 1001 ownership before first run
- Uses service name `bamboobot` for docker compose exec commands