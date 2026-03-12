#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Server Health Check Script
# Run on EC2 to verify all services are running correctly
#
# Usage:
#   ./scripts/healthcheck.sh
#   ./scripts/healthcheck.sh https://api.yourdomain.com
# ─────────────────────────────────────────────────────────────────────────────

API_URL="${1:-http://localhost:8000}"
PASS=0
FAIL=0

check() {
    local name="$1"
    local cmd="$2"
    if eval "$cmd" > /dev/null 2>&1; then
        echo "  ✅ $name"
        PASS=$((PASS + 1))
    else
        echo "  ❌ $name"
        FAIL=$((FAIL + 1))
    fi
}

echo ""
echo "═══════════════════════════════════════"
echo "  CRM Platform — Health Check"
echo "  $(date)"
echo "═══════════════════════════════════════"

echo ""
echo "── Docker Containers ──"
check "Backend container running"  "docker ps --filter name=crm_backend --filter status=running | grep crm_backend"
check "Redis container running"    "docker ps --filter name=crm_redis  --filter status=running | grep crm_redis"

echo ""
echo "── Service Endpoints ──"
check "Backend /health"            "curl -sf $API_URL/health"
check "Backend /docs reachable"   "curl -sf $API_URL/docs"

echo ""
echo "── Redis ──"
check "Redis ping"                 "docker exec crm_redis redis-cli ping"

echo ""
echo "── System Resources ──"
echo "  Disk usage:"
df -h / | tail -1 | awk '{print "    Used: "$3" / "$2" ("$5" full)"}'
echo "  Memory:"
free -h | grep Mem | awk '{print "    Used: "$3" / "$2}'
echo "  Docker volumes:"
docker volume ls --filter name=uploads_data --filter name=redis_data 2>/dev/null | grep -v DRIVER | awk '{print "    "$2}'

echo ""
echo "── Recent Backend Logs (last 5 lines) ──"
docker logs crm_backend --tail 5 2>&1 | sed 's/^/  /'

echo ""
echo "═══════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════"
echo ""

if [ $FAIL -gt 0 ]; then
    exit 1
fi
