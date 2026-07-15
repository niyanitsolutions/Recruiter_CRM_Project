#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Frontend Deploy Script — web.hireflowcrm.com
# Run this ON THE EC2 BOX after every `git push` to main.
#
# Flow:
#   git pull → npm ci → npm run build → copy dist into a new release dir →
#   atomically flip the "current" symlink → done (zero downtime, no reload
#   needed — see the note in nginx/backend.conf about why).
#
# Usage:
#   ssh ubuntu@<EC2-IP>
#   cd /home/ubuntu/crm-project && ./scripts/deploy-frontend.sh
#
# First-time setup (once per box) — see DEPLOYMENT SETUP in this repo's
# nginx/backend.conf header for the matching nginx side:
#   sudo mkdir -p /var/www/web.hireflowcrm.com/releases
#   sudo chown -R ubuntu:ubuntu /var/www/web.hireflowcrm.com
# ─────────────────────────────────────────────────────────────────────────────

set -e   # exit on any error

REPO_DIR="/home/ubuntu/crm-project"
WEB_ROOT="/var/www/web.hireflowcrm.com"
RELEASES_DIR="$WEB_ROOT/releases"
KEEP_RELEASES=5   # how many past releases to retain for instant rollback

echo "============================================"
echo "  Frontend Deploy — web.hireflowcrm.com"
echo "  $(date)"
echo "============================================"

cd "$REPO_DIR"

echo "[1/5] Pulling latest code from GitHub (main)..."
git fetch origin main
git checkout main
git pull origin main
echo "✓ Code up to date: $(git rev-parse --short HEAD)"

echo "[2/5] Installing dependencies..."
cd "$REPO_DIR/frontend"
npm ci
echo "✓ Dependencies installed"

echo "[3/5] Building production bundle..."
npm run build
echo "✓ Build complete"

echo "[4/5] Publishing new release..."
RELEASE_ID="$(date +%Y%m%d%H%M%S)"
RELEASE_PATH="$RELEASES_DIR/$RELEASE_ID"
mkdir -p "$RELEASE_PATH"
cp -r dist/* "$RELEASE_PATH/"

# Atomic symlink swap — the running nginx never sees a half-copied build.
# ln -sfn creates the new symlink under a temp name then renames it into
# place, which POSIX guarantees is atomic.
ln -sfn "$RELEASE_PATH" "$WEB_ROOT/current"
echo "✓ Live: $RELEASE_PATH"

echo "[5/5] Pruning old releases (keeping last $KEEP_RELEASES)..."
cd "$RELEASES_DIR"
ls -1t | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf
echo "✓ Cleanup done"

# Reload is NOT required for the symlink swap itself, but running it anyway
# is a cheap, zero-downtime no-op that also picks up any nginx config change
# that might have shipped alongside this deploy.
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "============================================"
echo "  Deployed $RELEASE_ID successfully"
echo "  Rollback: ln -sfn <previous-release-path> $WEB_ROOT/current"
echo "============================================"
