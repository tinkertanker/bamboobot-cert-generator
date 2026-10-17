#!/bin/bash
# Delete expired files from cloud storage (Cloudflare R2 or Amazon S3).
# Run daily via cron, e.g.: 0 2 * * * /path/to/scripts/storage-cleanup.sh
#
# Environment:
#   STORAGE_PROVIDER    cloudflare-r2 or amazon-s3 (picks the endpoint)
#   CLEANUP_SECRET_KEY  must match the server's value (required in production)
#   CLEANUP_BASE_URL    app URL, default http://localhost:3000
#   CLEANUP_API_URL     full endpoint URL; overrides the two settings above
#   CLEANUP_DRY_RUN=1   report what would be deleted without deleting

# Load environment variables if .env exists
ENV_FILE="$(dirname "$0")/../.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

case "${STORAGE_PROVIDER:-}" in
  amazon-s3) ENDPOINT="cleanup-s3" ;;
  cloudflare-r2) ENDPOINT="cleanup-r2" ;;
  *)
    if [ -z "${CLEANUP_API_URL:-}" ]; then
      echo "[$(date)] Storage cleanup skipped: STORAGE_PROVIDER is '${STORAGE_PROVIDER:-local}', not cloudflare-r2 or amazon-s3"
      exit 0
    fi
    ;;
esac

API_URL="${CLEANUP_API_URL:-${CLEANUP_BASE_URL:-http://localhost:3000}/api/${ENDPOINT}}"
if [ "${CLEANUP_DRY_RUN:-}" = "1" ]; then
  API_URL="${API_URL}?dryRun=1"
fi

CURL_ARGS=(-s -X POST "$API_URL" -H "Content-Type: application/json" -w $'\n%{http_code}')
if [ -n "${CLEANUP_SECRET_KEY:-}" ]; then
  # Pass the key via a private file so it does not show in process listings.
  HEADER_FILE=$(umask 077 && mktemp)
  trap 'rm -f "$HEADER_FILE"' EXIT
  printf 'X-Cleanup-Key: %s\n' "$CLEANUP_SECRET_KEY" > "$HEADER_FILE"
  CURL_ARGS+=(-H "@$HEADER_FILE")
fi

if ! output=$(curl "${CURL_ARGS[@]}"); then
  echo "[$(date)] Storage cleanup failed: could not reach $API_URL"
  exit 1
fi

status="${output##*$'\n'}"
body="${output%$'\n'*}"
if [ "$status" != "200" ]; then
  echo "[$(date)] Storage cleanup failed (HTTP $status): $body"
  exit 1
fi
echo "[$(date)] Storage cleanup completed: $body"
