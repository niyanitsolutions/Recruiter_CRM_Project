# Phase F — Production Smoke Test Runbook

Run this on the **staging or production box** before opening HireFlow to
customers. Phase F changes no application code — it verifies that everything the
A–D work built actually behaves correctly in the real deployment. Local
verification (Phase E: 27/27 live API + 83 behavioral/unit checks) proved the
logic; this proves the *deployment*.

**Gate:** do not announce publicly until every ❗ item passes.

---

## 0. Pre-flight (once, on the box)

- [ ] `.env` has real values: `JWT_SECRET_KEY` (64+ chars), `FERNET_SECRET_KEY`,
      strong `DEFAULT_SUPERADMIN_PASSWORD`, `MONGODB_URI`, `REDIS_PASSWORD`,
      and optionally `SENTRY_DSN` + `ENVIRONMENT=production`.
- [ ] Backend image rebuilt this release (Dockerfile CMD + requirements changed
      in A/D): `docker-compose -f docker-compose.prod.yml up -d --build` (or pull).
- [ ] Frontend rebuilt + deployed (`scripts/deploy-frontend.sh`).

## 1. nginx config validation ❗

```
sudo cp nginx/backend.conf /etc/nginx/sites-available/crm-backend
sudo nginx -t                 # must print: syntax is ok / test is successful
sudo systemctl reload nginx
```
- [ ] `nginx -t` passes. If the `proxy_cache_path` line errors, ensure
      `/var/cache/nginx/crm_uploads` is creatable (nginx creates it, but the
      parent must be writable by the nginx user).

## 2. Automated smoke test ❗

```
BASE_URL=https://web.hireflowcrm.com \
SMOKE_EMAIL=<test-user-email> SMOKE_PASSWORD=<pw> \
SMOKE_UPLOAD_PATH=/api/v1/uploads/profiles/<an-existing-file>.jpg \
./scripts/smoke-test.sh
```
Expect **SMOKE TEST: PASS**. It covers, automatically:
- [ ] `/health`, `/live` → 200
- [ ] `/ready` → mongodb ok, **redis ok** (Phase D fixed the probe; "degraded"
      here now means Redis is genuinely unreachable — investigate), schedulers
      field present with a live leader heartbeat, uploads_disk present
- [ ] index.html carries CSP + HSTS + `no-store`
- [ ] API responses carry `X-Request-ID`
- [ ] hashed `/assets/*.js` → `Cache-Control: immutable` + compressed
- [ ] uploaded file → `X-Cache-Status: HIT` on 2nd fetch + `Cache-Control: public`
- [ ] login → authed call → **WebSocket handshake 101** → refresh → logout →
      post-logout token rejected (401)
- [ ] unauthenticated `/users` → 401/403

## 3. Browser DevTools checks (manual) ❗

Open the app in Chrome/Firefox, DevTools open:
- [ ] **Console → no CSP violations** (`Refused to load/connect/execute …`). If any
      appear, note the blocked origin — the CSP in `nginx/backend.conf` is
      deliberately permissive on script/style but only whitelists Razorpay +
      Google Fonts for external origins; a new third-party would need adding.
- [ ] **Network → WS**: the `ws/session` (and `crm/ws`) request shows
      `101 Switching Protocols` and stays open (not a reconnect storm).
- [ ] **Network**: an avatar/logo under `/api/v1/uploads/…` shows
      `X-Cache-Status: HIT` on reload and is served from cache, not re-fetched
      through Python.
- [ ] Razorpay checkout opens (payment iframe not CSP-blocked).
- [ ] Google Fonts load (no blocked font requests).

## 4. Core user journeys (manual, as a real test user) ❗

- [ ] Login → dashboard loads; **reopen dashboard → instant** (Phase C cache).
- [ ] Open Candidates → back → **reopen instant** (Phase C list cache); create a
      candidate → it appears within ~5s (live poll).
- [ ] Upload a resume; then **preview / download it** — renders correctly.
- [ ] Upload a candidate/employee **photo** → image renders (not broken).
- [ ] Company **logo** upload → renders in the app.
- [ ] **Generate an offer letter / HR document** → a PDF is produced AND can be
      re-downloaded later (Phase B `upload_bytes` fix — verify the stored URL is
      not null by reopening the generated document).
- [ ] Attendance punch-in/out (geolocation prompt appears — Permissions-Policy
      allows it).
- [ ] Logout → confirm you're returned to login and the session is dead.

## 5. Infrastructure checks (manual)

- [ ] **Redis**: `docker exec hireflow_redis redis-cli -a "$REDIS_PASSWORD" ping`
      → PONG. Confirmed indirectly by `/ready` redis:ok.
- [ ] **Scheduler leader election** (critical with 2 workers): confirm exactly
      one leader and no duplicate reminder emails.
      `docker logs hireflow_backend | grep -i "scheduler.*leader"` — expect ONE
      "started N loops as leader" line, not one per worker. `/ready`'s
      `schedulers` block should show all 5 loops `running`.
- [ ] **Sentry** (if `SENTRY_DSN` set): trigger a deliberate 500 on a throwaway
      endpoint or check the Sentry project receives the app's startup — confirm
      events arrive with `environment=production`.
- [ ] **Slow-request logging**: `docker logs hireflow_backend | grep "slow request"`
      — verify the format includes request-id/path/duration.
- [ ] **TLS auto-renewal**: `sudo systemctl status certbot.timer` is active
      (prevents a day-90 cert-expiry outage).

## 6. Backup & restore drill ❗ (do NOT skip — untested backups are not backups)

```
# Produce a fresh backup (DB + uploads volume)
S3_BUCKET=<dr-bucket> ./scripts/backup.sh

# Restore into a THROWAWAY scratch DB — never production
MONGODB_URI="mongodb://localhost:27017/restore_test" \
  DB_ARCHIVE=/home/ubuntu/backups/crm_backup_<ts>.gz \
  CONFIRM=RESTORE ./scripts/restore.sh
```
- [ ] Backup produces BOTH `crm_backup_*.gz` and `crm_uploads_*.tar.gz`.
- [ ] Restore completes; `restore_test` contains master + at least one `c_*`
      tenant DB with user documents (see DISASTER_RECOVERY.md §4 checklist).

## 7. Basic load test ❗ (50–100 concurrent, before opening to customers)

```
pip install httpx
python scripts/load-test.py --base-url https://web.hireflowcrm.com \
    --email <test-user> --password <pw> --users 50 --duration 60
```
- [ ] **Judge by 5xx + transport errors + p95 latency — NOT by 429s.** A single
      test machine shares one IP and hits the per-IP nginx ceiling (600 r/m), so
      429s are expected test artifacts. Verdict should be **HEALTHY** (zero 5xx,
      <1% transport errors).
- [ ] For a true capacity read: `--insecure-direct` (bypasses nginx limit) or
      drive from several source IPs and sum. Watch `docker stats` for backend
      CPU/RAM and the box's CPU-credit balance (t3) during the run.
- [ ] Repeat at `--users 100`; confirm p95 stays acceptable and no 5xx.

---

## Pass criteria

Open to customers only when **all ❗ sections pass**: nginx reload, automated
smoke test, browser CSP/WS/cache, core journeys, backup+restore drill, and a
clean 50–100 user load run with no 5xx.

## Known residual (track, not a blocker for a controlled launch)

- Uploaded files are still served without per-request authorization (unguessable
  UUID URLs only). Signed-URL access is the top post-launch security item — see
  the Phase B commit notes and the final audit report.
