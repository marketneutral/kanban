#!/bin/sh
set -e

# Create/update the SQLite schema (no-op when already in sync)
npx prisma db push --skip-generate

# Opt-in demo data: run with -e SEED=1 (idempotent — never duplicates)
if [ "$SEED" = "1" ]; then
  npx prisma db seed
fi

exec node_modules/.bin/next start -p "${PORT:-8642}"
