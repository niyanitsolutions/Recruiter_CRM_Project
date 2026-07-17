# Disaster Recovery Runbook — Niyan HireFlow CRM

Scope: what to back up, how to restore, and how to *verify* backups actually
work. Produced in Phase B of the production-hardening plan. This is
documentation only — it changes no application behavior.

## 1. What must be backed up

| Data | Where it lives | Backed up by | Loss impact |
|------|----------------|--------------|-------------|
| All tenant databases + master_db | MongoDB (Atlas or self-hosted) | `scripts/backup.sh` → `mongodump` | Total data loss |
| Uploaded files (resumes, candidate photos, company logos, generated HR documents) | Docker volume `uploads_data` (`/app/uploads` in the backend container) | `scripts/backup.sh` → `tar` of the volume | **Permanent loss of all tenant files** |
| Redis (sessions/cache) | Docker volume `redis_data` | Not backed up (by design) | Acceptable — cache only; users re-login |
| Secrets (`.env`: JWT, FERNET, DB URI, SMTP, Razorpay) | `/home/ubuntu/crm-backend/.env` | **Not automated — store in a password manager / secrets vault** | Cannot decrypt integration secrets or sign tokens |

> Before Phase B, uploaded files had **no backup path at all**. `scripts/backup.sh`
> now archives the `uploads_data` volume alongside the DB dump.

## 2. Backup schedule (cron on the EC2 host)

```
# Daily at 02:00 — DB + uploaded files, retained 7 days locally, pushed to S3
0 2 * * * S3_BUCKET=<your-dr-bucket> /home/ubuntu/crm-project/scripts/backup.sh >> /var/log/crm-backup.log 2>&1
```

Run `scripts/backup.sh` as a user that can read the Docker volume mountpoint
(usually root/sudo), otherwise the uploads `tar` step is skipped with a warning.

Set `UPLOADS_PATH` explicitly if `docker volume inspect uploads_data` is not
available to the backup user.

## 3. Restore procedure (DR event)

```
MONGODB_URI="<prod-uri>" \
  DB_ARCHIVE=/home/ubuntu/backups/crm_backup_<ts>.gz \
  UPLOADS_ARCHIVE=/home/ubuntu/backups/crm_uploads_<ts>.tar.gz \
  UPLOADS_PATH=/var/lib/docker/volumes/uploads_data/_data \
  DROP=1 CONFIRM=RESTORE \
  ./scripts/restore.sh
```

Then restore `.env` from the vault, `docker-compose -f docker-compose.prod.yml up -d`,
and run the verification checklist below.

## 4. Restore VERIFICATION (mandatory monthly drill)

An untested backup is not a backup. Once a month, restore the latest archive
into a **throwaway** target and confirm it is usable — never restore into
production for a drill.

```
# Scratch DB — NOT production
MONGODB_URI="mongodb://localhost:27017/restore_test" \
  DB_ARCHIVE=/home/ubuntu/backups/crm_backup_<ts>.gz \
  CONFIRM=RESTORE ./scripts/restore.sh
```

Verification checklist (record pass/fail + date):
- [ ] `mongorestore` completes without error
- [ ] `restore_test` contains `master_db`-equivalent + at least one `c_*` tenant DB
- [ ] A tenant's `users` collection has documents
- [ ] Uploads archive extracts and contains `resumes/`, `profiles/`, `hrm_docs/`
- [ ] (Full-stack drill) log in, open a candidate with a photo, download a resume, generate a document

## 5. RPO / RTO targets (proposed — confirm with the business)

- **RPO** (max data loss): 24 h with daily backups. Tighten to ≤1 h by moving to
  MongoDB Atlas continuous/point-in-time backups.
- **RTO** (time to recover): a few hours on a single EC2 (provision box → restore
  DB + files → restore `.env` → start). Reduce with infra-as-code + a warm standby.

## 6. Known single points of failure (tracked, not yet fixed)

- Single EC2 host: nginx + app + Redis + uploads volume co-located → instance
  loss is a full outage. Horizontal scale-out is blocked by local-volume uploads
  (a later phase should return uploads to S3).
- TLS certificate auto-renewal (certbot timer) — verify `systemctl status
  certbot.timer` on the box; a lapsed cert is a day-90 outage.
