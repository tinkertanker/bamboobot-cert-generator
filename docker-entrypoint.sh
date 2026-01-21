#!/bin/sh
set -e

DB_PATH="/app/prisma/database.db"

# Check if database file is empty or doesn't exist
if [ ! -s "$DB_PATH" ]; then
  echo "Database is empty or missing. Initializing schema..."
  npx prisma db push --skip-generate
  echo "Database initialized successfully."
fi

# Start the application
exec "$@"
