#!/bin/bash
set -e

# Deploy script for Bamboobot
# Usage: ./scripts/deploy.sh [--no-pull] [--logs]

cd "$(dirname "$0")/.."

PULL=true
SHOW_LOGS=false

for arg in "$@"; do
  case $arg in
    --no-pull)
      PULL=false
      ;;
    --logs)
      SHOW_LOGS=true
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: ./scripts/deploy.sh [--no-pull] [--logs]"
      exit 1
      ;;
  esac
done

echo "==> Deploying Bamboobot..."

# Pull latest changes
if [ "$PULL" = true ]; then
  echo "==> Pulling latest changes..."
  git pull
fi

# Ensure data directories exist
echo "==> Ensuring data directories exist..."
mkdir -p data/temp_images data/generated data/template_images

# Build and restart
echo "==> Building and restarting containers..."
docker compose down
docker compose build --no-cache
docker compose up -d

echo "==> Waiting for container to start..."
sleep 3

# Check if container is running
if docker compose ps | grep -q "Up\|running"; then
  echo "==> Deploy complete! Container is running."
else
  echo "==> Warning: Container may not have started correctly."
  docker compose logs --tail=20
  exit 1
fi

# Show logs if requested
if [ "$SHOW_LOGS" = true ]; then
  echo "==> Showing logs (Ctrl+C to exit)..."
  docker compose logs -f
fi
