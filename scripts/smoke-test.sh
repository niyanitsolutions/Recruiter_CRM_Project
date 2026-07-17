#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Phase F — Automated Production Smoke Test
#
# Verifies the deployed stack (nginx + FastAPI + Redis + Mongo) end-to-end.
# Read-only except for one login/logout with the credentials you supply.
# Run ON or AGAINST the staging/production box:
#
#   BASE_URL=https://web.hireflowcrm.com \
#   SMOKE_EMAIL=<test-user-email> SMOKE_PASSWORD=<password> \
#   ./scripts/smoke-test.sh
#
# Optional:
#   SMOKE_UPLOAD_PATH=/api/v1/uploads/profiles/<some-real-file>.jpg
#       an existing uploaded file, used to verify nginx proxy_cache
#       (X-Cache-Status MISS then HIT). Skipped if unset.
#
# Exit code 0 = all automated checks passed. Manual checks (browser CSP,
# offer-letter generation, restore drill) live in PHASE_F_SMOKE_TEST.md.
# ─────────────────────────────────────────────────────────────────────────────

set -u
BASE_URL="${BASE_URL:-https://web.hireflowcrm.com}"
PASS=0; FAIL=0
CURL="curl -sk --max-time 20"

ok()   { PASS=$((PASS+1)); echo "  ok   $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL $1   [$2]"; }
hdr()  { echo "$1" | grep -i "^$2:" | head -1 | tr -d '\r'; }

echo "Phase F smoke test → $BASE_URL"
echo "════════════════════════════════════════════════════════"

# ── 1. Health endpoints ───────────────────────────────────────────────────────
for ep in /health /live; do
    code=$($CURL -o /dev/null -w "%{http_code}" "$BASE_URL$ep")
    [ "$code" = "200" ] && ok "GET $ep -> 200" || bad "GET $ep" "got $code"
done

ready=$($CURL "$BASE_URL/ready")
echo "$ready" | grep -q '"mongodb": *"ok"' \
    && ok "/ready: mongodb ok" || bad "/ready: mongodb" "$ready"
echo "$ready" | grep -q '"redis": *"ok"' \
    && ok "/ready: redis ok" || bad "/ready: redis (Phase D fixed the probe — 'degraded' here is real)" "$(echo "$ready" | head -c 300)"
echo "$ready" | grep -q '"schedulers"' \
    && ok "/ready: schedulers field present" || bad "/ready: schedulers" "missing"
echo "$ready" | grep -q 'no_leader_heartbeat' \
    && bad "/ready: scheduler leader heartbeat" "no_leader_heartbeat — no worker holds the lock" \
    || ok "/ready: scheduler leader heartbeat present"
echo "$ready" | grep -q '"uploads_disk"' \
    && ok "/ready: uploads_disk present" || bad "/ready: uploads_disk" "missing"

# ── 2. Security + observability headers on the SPA document ─────────────────
h=$($CURL -D - -o /dev/null "$BASE_URL/index.html")
echo "$h" | grep -qi "content-security-policy" \
    && ok "index.html: CSP header present" || bad "index.html: CSP" "absent"
echo "$h" | grep -qi "strict-transport-security" \
    && ok "index.html: HSTS present" || bad "index.html: HSTS" "absent"
echo "$h" | grep -qi "cache-control: no-store" \
    && ok "index.html: no-store" || bad "index.html: cache-control" "$(hdr "$h" cache-control)"

h=$($CURL -D - -o /dev/null "$BASE_URL/api/v1/info")
echo "$h" | grep -qi "x-request-id" \
    && ok "API: X-Request-ID header present" || bad "API: X-Request-ID" "absent"

# ── 3. Hashed static asset — immutable cache ─────────────────────────────────
asset=$($CURL "$BASE_URL/index.html" | grep -oE '/assets/[^"]+\.js' | head -1)
if [ -n "$asset" ]; then
    h=$($CURL -D - -o /dev/null "$BASE_URL$asset")
    echo "$h" | grep -qi "immutable" \
        && ok "static asset: Cache-Control immutable" \
        || bad "static asset cache" "$(hdr "$h" cache-control)"
    echo "$h" | grep -qi "content-encoding: *\(gzip\|br\)" \
        && ok "static asset: compressed" || bad "static asset: compression" "$(hdr "$h" content-encoding)"
else
    bad "static asset discovery" "no /assets/*.js found in index.html"
fi

# ── 4. Uploaded-file caching (optional — needs a real file path) ─────────────
if [ -n "${SMOKE_UPLOAD_PATH:-}" ]; then
    h1=$($CURL -D - -o /dev/null "$BASE_URL$SMOKE_UPLOAD_PATH")
    h2=$($CURL -D - -o /dev/null "$BASE_URL$SMOKE_UPLOAD_PATH")
    echo "$h2" | grep -qi "x-cache-status: *HIT" \
        && ok "upload: X-Cache-Status HIT on 2nd fetch (nginx cache working)" \
        || bad "upload: X-Cache-Status" "1st=$(hdr "$h1" x-cache-status) 2nd=$(hdr "$h2" x-cache-status)"
    echo "$h2" | grep -qi "cache-control: *public" \
        && ok "upload: browser Cache-Control public" || bad "upload: cache-control" "$(hdr "$h2" cache-control)"
else
    echo "  skip upload-cache check (set SMOKE_UPLOAD_PATH to a real /api/v1/uploads/... file)"
fi

# ── 5. Auth flow: login → authed call → refresh → WS 101 → logout ────────────
if [ -n "${SMOKE_EMAIL:-}" ] && [ -n "${SMOKE_PASSWORD:-}" ]; then
    login=$($CURL -X POST "$BASE_URL/api/v1/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"identifier\":\"$SMOKE_EMAIL\",\"password\":\"$SMOKE_PASSWORD\"}")
    access=$(echo "$login"  | grep -o '"access_token":"[^"]*'  | cut -d'"' -f4)
    refresh=$(echo "$login" | grep -o '"refresh_token":"[^"]*' | cut -d'"' -f4)
    if [ -n "$access" ]; then
        ok "login returns tokens"

        code=$($CURL -o /dev/null -w "%{http_code}" \
            -H "Authorization: Bearer $access" "$BASE_URL/api/v1/notifications/unread-count" )
        [ "$code" = "200" ] && ok "authed API call -> 200" || bad "authed API call" "got $code"

        # WebSocket handshake through nginx — expect 101 Switching Protocols
        ws=$($CURL -o /dev/null -w "%{http_code}" --http1.1 \
            -H "Connection: Upgrade" -H "Upgrade: websocket" \
            -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: c21va2V0ZXN0MTIzNDU2Nzg=" \
            "$BASE_URL/api/v1/ws/session?token=$access")
        [ "$ws" = "101" ] && ok "WebSocket handshake -> 101 Switching Protocols" \
            || bad "WebSocket handshake" "got $ws (Phase A nginx upgrade config not live?)"

        newacc=$($CURL -X POST "$BASE_URL/api/v1/auth/refresh" \
            -H "Content-Type: application/json" \
            -d "{\"refresh_token\":\"$refresh\"}" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
        [ -n "$newacc" ] && ok "refresh returns rotated access token" || bad "refresh" "no token"

        code=$($CURL -o /dev/null -w "%{http_code}" -X POST \
            -H "Authorization: Bearer ${newacc:-$access}" "$BASE_URL/api/v1/auth/logout")
        [ "$code" = "200" ] && ok "logout -> 200" || bad "logout" "got $code"

        code=$($CURL -o /dev/null -w "%{http_code}" \
            -H "Authorization: Bearer ${newacc:-$access}" "$BASE_URL/api/v1/notifications/unread-count")
        [ "$code" = "401" ] && ok "token rejected after logout (server-side revocation)" \
            || bad "post-logout revocation" "got $code, expected 401"
    else
        bad "login" "$(echo "$login" | head -c 300)"
    fi
else
    echo "  skip auth-flow checks (set SMOKE_EMAIL + SMOKE_PASSWORD)"
fi

# ── 6. Unauthenticated access denied ─────────────────────────────────────────
code=$($CURL -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/users")
{ [ "$code" = "401" ] || [ "$code" = "403" ]; } \
    && ok "unauthenticated /users -> $code" || bad "unauthenticated /users" "got $code"

echo "════════════════════════════════════════════════════════"
echo "RESULT: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && echo "SMOKE TEST: PASS" || echo "SMOKE TEST: FAIL — do not open to customers"
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
