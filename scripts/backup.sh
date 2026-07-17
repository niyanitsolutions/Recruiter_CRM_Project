#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Database Backup Script
# Backs up MongoDB data to local file + optionally uploads to S3
#
# Usage:
#   ./scripts/backup.sh                    (local backup only)
#   S3_BUCKET=my-bucket ./scripts/backup.sh (backup + upload to S3)
#
# Schedule with cron (daily at 2 AM):
#   0 2 * * * /home/ubuntu/crm-project/scripts/backup.sh >> /var/log/crm-backup.log 2>&1
# ─────────────────────────────────────────────────────────────────────────────

set -e

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/home/ubuntu/backups"
BACKUP_FILE="crm_backup_${TIMESTAMP}.gz"

# Load env if available
if [ -f /home/ubuntu/crm-backend/.env ]; then
    export $(grep -v '^#' /home/ubuntu/crm-backend/.env | xargs) 2>/dev/null || true
fi

echo "[$(date)] Starting backup: $BACKUP_FILE"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# ─── MongoDB Backup ────────────────────────────────────────────────────────────

if [ -n "$MONGODB_URI" ]; then
    echo "[$(date)] Dumping MongoDB (Atlas)..."
    mongodump --uri="$MONGODB_URI" --archive="$BACKUP_DIR/$BACKUP_FILE" --gzip
else
    echo "[$(date)] Dumping local MongoDB..."
    mongodump --archive="$BACKUP_DIR/$BACKUP_FILE" --gzip
fi

BACKUP_SIZE=$(du -sh "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup created: $BACKUP_DIR/$BACKUP_FILE ($BACKUP_SIZE)"

# ─── Upload to S3 (optional) ───────────────────────────────────────────────────

if [ -n "$S3_BUCKET" ]; then
    echo "[$(date)] Uploading DB backup to S3: s3://$S3_BUCKET/backups/$BACKUP_FILE"
    aws s3 cp "$BACKUP_DIR/$BACKUP_FILE" "s3://$S3_BUCKET/backups/$BACKUP_FILE"
    echo "[$(date)] Upload complete"
fi

# ─── Uploaded-files Backup ─────────────────────────────────────────────────────
# The MongoDB dump above does NOT contain uploaded files (resumes, candidate
# photos, company logos, generated HR documents). Those live on the Docker
# volume `uploads_data`, mounted into the backend container at /app/uploads.
# A disk/instance loss without this step permanently destroys every tenant file.
#
# UPLOADS_PATH resolution order:
#   1. $UPLOADS_PATH if set explicitly
#   2. the Docker named volume mountpoint (docker volume inspect)
#   3. a conventional host path fallback
UPLOADS_FILE="crm_uploads_${TIMESTAMP}.tar.gz"

if [ -z "$UPLOADS_PATH" ]; then
    if command -v docker >/dev/null 2>&1; then
        UPLOADS_PATH=$(docker volume inspect uploads_data \
            --format '{{ .Mountpoint }}' 2>/dev/null || true)
    fi
fi
if [ -z "$UPLOADS_PATH" ] && [ -d /var/lib/docker/volumes/uploads_data/_data ]; then
    UPLOADS_PATH=/var/lib/docker/volumes/uploads_data/_data
fi

if [ -n "$UPLOADS_PATH" ] && [ -d "$UPLOADS_PATH" ]; then
    echo "[$(date)] Archiving uploaded files from: $UPLOADS_PATH"
    tar -czf "$BACKUP_DIR/$UPLOADS_FILE" -C "$UPLOADS_PATH" . 2>/dev/null || \
        echo "[$(date)] WARNING: uploads archive failed (permissions? run as root/sudo)"
    UPLOADS_SIZE=$(du -sh "$BACKUP_DIR/$UPLOADS_FILE" 2>/dev/null | cut -f1)
    echo "[$(date)] Uploads archived: $BACKUP_DIR/$UPLOADS_FILE ($UPLOADS_SIZE)"
    if [ -n "$S3_BUCKET" ] && [ -f "$BACKUP_DIR/$UPLOADS_FILE" ]; then
        echo "[$(date)] Uploading files backup to S3: s3://$S3_BUCKET/backups/$UPLOADS_FILE"
        aws s3 cp "$BACKUP_DIR/$UPLOADS_FILE" "s3://$S3_BUCKET/backups/$UPLOADS_FILE"
    fi
else
    echo "[$(date)] WARNING: uploads path not found — set UPLOADS_PATH to back up files. DB-only backup produced."
fi

# ─── Clean up old backups (keep last 7 days) ───────────────────────────────────

echo "[$(date)] Cleaning backups older than 7 days..."
find "$BACKUP_DIR" -name "crm_backup_*.gz"   -mtime +7 -delete
find "$BACKUP_DIR" -name "crm_uploads_*.tar.gz" -mtime +7 -delete

echo "[$(date)] Backup complete: DB=$BACKUP_FILE  FILES=${UPLOADS_FILE:-<skipped>}"
