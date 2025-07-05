#!/bin/bash
# R2 Cleanup Script - Run via cron job
# Example cron: 0 2 * * * /path/to/r2-cleanup.sh

# Load environment variables if .env.local exists
if [ -f "$(dirname "$0")/../.env.local" ]; then
  export $(cat "$(dirname "$0")/../.env.local" | grep -v '^#' | xargs)
fi

# Set the API URL (adjust for your deployment)
API_URL="${CLEANUP_API_URL:-http://localhost:3000/api/cleanup-r2}"

# Optional: Set cleanup secret key for authentication
CLEANUP_KEY="${CLEANUP_SECRET_KEY:-}"

# Make the cleanup request
if [ -n "$CLEANUP_KEY" ]; then
  response=$(curl -s -X POST "$API_URL" \
    -H "X-Cleanup-Key: $CLEANUP_KEY" \
    -H "Content-Type: application/json")
else
  response=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json")
fi

# Check if request was successful
if [ $? -eq 0 ]; then
  echo "[$(date)] R2 Cleanup completed: $response"
else
  echo "[$(date)] R2 Cleanup failed"
  exit 1
fi