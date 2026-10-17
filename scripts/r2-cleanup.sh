#!/bin/bash
# Kept for existing cron entries. Use scripts/storage-cleanup.sh, which also
# handles Amazon S3.
export STORAGE_PROVIDER="${STORAGE_PROVIDER:-cloudflare-r2}"
exec "$(dirname "$0")/storage-cleanup.sh" "$@"
