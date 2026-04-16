#!/bin/sh
set -e

echo "==> Running database migrations..."
npx prisma db push --skip-generate --accept-data-loss 2>&1 || {
  echo "WARNING: prisma db push failed, retrying in 5s..."
  sleep 5
  npx prisma db push --skip-generate --accept-data-loss
}

echo "==> Starting application..."
exec node dist/src/main.js
