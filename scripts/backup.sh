#!/usr/bin/env bash
# Logical backup of the DataPay PostgreSQL database.  Usage: DATABASE_URL=postgres://... npm run db:backup
# Keep the files somewhere other than the database host. Restore with: pg_restore --clean --no-owner -d <url> file.dump
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to a postgres:// connection string}"
mkdir -p backups
out="backups/datapay-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner "$DATABASE_URL" --file "$out"
echo "Backup written to $out"
# keep the 30 most recent
ls -1t backups/datapay-*.dump | tail -n +31 | xargs -r rm --
