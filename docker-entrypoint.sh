#!/bin/sh
set -e

DB_PATH="/app/prisma/database.db"
# Agent deployments use a shared SQLite directory outside the schema directory.
case "${DATABASE_URL:-}" in
  file:/*) DB_PATH="${DATABASE_URL#file:}" ;;
esac

# Check if database file is empty or doesn't exist
if [ ! -s "$DB_PATH" ]; then
  echo "Database is empty or missing. Initializing schema..."
  npx prisma db push --skip-generate
  echo "Database initialized successfully."
fi

# Start the application
exec "$@"
