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
    echo "[$(date)] Uploading to S3: s3://$S3_BUCKET/backups/$BACKUP_FILE"
    aws s3 cp "$BACKUP_DIR/$BACKUP_FILE" "s3://$S3_BUCKET/backups/$BACKUP_FILE"
    echo "[$(date)] Upload complete"
fi

# ─── Clean up old backups (keep last 7 days) ───────────────────────────────────

echo "[$(date)] Cleaning backups older than 7 days..."
find "$BACKUP_DIR" -name "crm_backup_*.gz" -mtime +7 -delete

echo "[$(date)] Backup complete: $BACKUP_FILE"
