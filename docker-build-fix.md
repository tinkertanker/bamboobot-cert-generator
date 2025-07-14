# Docker Build Fix for react-window Module Error

If you're getting a "Module not found: Can't resolve 'react-window'" error when building with Docker, try these solutions:

## Solution 1: Clear Docker cache and rebuild
```bash
# For production build
docker-compose build --no-cache bamboobot

# For development build
docker-compose -f docker-compose.dev.yml build --no-cache bamboobot-dev
```

## Solution 2: Ensure package-lock.json is up to date
```bash
# Run this locally first
npm install
git add package-lock.json
git commit -m "Update package-lock.json"

# Then rebuild Docker
docker-compose build
```

## Solution 3: Clean everything and start fresh
```bash
# Stop and remove containers
docker-compose down

# Remove all images related to this project
docker images | grep bamboobot | awk '{print $3}' | xargs docker rmi -f

# Rebuild from scratch
docker-compose build
docker-compose up -d
```

## Solution 4: Check if running in development mode
If you're using docker-compose.dev.yml, make sure the build target is correct:
```yaml
build:
  context: .
  target: builder  # This should use the stage that has all dependencies
```

## Why this happens
The error occurs because `react-window` is a dependency that's required during the build process. If Docker's cache gets out of sync with your package.json/package-lock.json, it might not install all dependencies properly.

## Prevention
Always ensure your package-lock.json is committed and up to date when making dependency changes.