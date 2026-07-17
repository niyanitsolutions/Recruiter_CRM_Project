#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Disaster-Recovery Restore Script  (companion to scripts/backup.sh)
#
# Restores a MongoDB dump and (optionally) the uploaded-files archive produced
# by backup.sh. DESTRUCTIVE — it overwrites data — so it refuses to run unless
# you explicitly confirm.
#
# Usage:
#   # 1. Verify a backup restores cleanly into a THROWAWAY target (recommended
#   #    monthly drill — see DISASTER_RECOVERY.md). Point MONGODB_URI at a
#   #    scratch database/cluster, NOT production:
#   MONGODB_URI="mongodb://localhost:27017/restore_test" \
#     DB_ARCHIVE=/home/ubuntu/backups/crm_backup_20260716_020000.gz \
#     CONFIRM=RESTORE ./scripts/restore.sh
#
#   # 2. Real restore into production (only during an actual DR event):
#   MONGODB_URI="<prod-uri>" \
#     DB_ARCHIVE=<db.gz> UPLOADS_ARCHIVE=<uploads.tar.gz> UPLOADS_PATH=<vol> \
#     CONFIRM=RESTORE ./scripts/restore.sh
#
# Required env:
#   DB_ARCHIVE   path to a crm_backup_*.gz  (mongodump --archive --gzip)
#   CONFIRM      must equal the literal string  RESTORE
# Optional env:
#   MONGODB_URI      target cluster (defaults to local mongod)
#   UPLOADS_ARCHIVE  path to a crm_uploads_*.tar.gz
#   UPLOADS_PATH     directory to extract uploads into (the uploads_data volume)
#   DROP             set to 1 to add --drop (replace existing collections)
# ─────────────────────────────────────────────────────────────────────────────

set -e

if [ "$CONFIRM" != "RESTORE" ]; then
    echo "Refusing to run: set CONFIRM=RESTORE to proceed (this OVERWRITES data)."
    exit 1
fi
if [ -z "$DB_ARCHIVE" ] || [ ! -f "$DB_ARCHIVE" ]; then
    echo "DB_ARCHIVE is not set or file not found: '$DB_ARCHIVE'"
    exit 1
fi

DROP_FLAG=""
[ "$DROP" = "1" ] && DROP_FLAG="--drop"

echo "[$(date)] Restoring MongoDB from: $DB_ARCHIVE  (drop=${DROP:-0})"
if [ -n "$MONGODB_URI" ]; then
    mongorestore --uri="$MONGODB_URI" --archive="$DB_ARCHIVE" --gzip $DROP_FLAG
else
    mongorestore --archive="$DB_ARCHIVE" --gzip $DROP_FLAG
fi
echo "[$(date)] MongoDB restore complete."

if [ -n "$UPLOADS_ARCHIVE" ]; then
    if [ ! -f "$UPLOADS_ARCHIVE" ]; then
        echo "UPLOADS_ARCHIVE set but file not found: '$UPLOADS_ARCHIVE'"; exit 1
    fi
    if [ -z "$UPLOADS_PATH" ]; then
        echo "UPLOADS_ARCHIVE given but UPLOADS_PATH (extract target) is not set."; exit 1
    fi
    mkdir -p "$UPLOADS_PATH"
    echo "[$(date)] Extracting uploads into: $UPLOADS_PATH"
    tar -xzf "$UPLOADS_ARCHIVE" -C "$UPLOADS_PATH"
    echo "[$(date)] Uploads restore complete."
fi

echo "[$(date)] Restore finished. Verify: log in, open a candidate with a photo,"
echo "          download a resume, and generate a document."
