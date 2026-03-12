#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# EC2 First-Time Setup Script
# Run this ONCE after launching a fresh Ubuntu 22.04 EC2 instance
#
# Usage:
#   scp -i crm-key.pem scripts/ec2-setup.sh ubuntu@YOUR_EC2_IP:/home/ubuntu/
#   ssh -i crm-key.pem ubuntu@YOUR_EC2_IP
#   chmod +x ec2-setup.sh && ./ec2-setup.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e   # Exit on any error

echo "============================================"
echo "  CRM Platform — EC2 Setup"
echo "============================================"

# ── 1. Update system ──────────────────────────────────────────────────────────
echo "[1/8] Updating system packages..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq

# ── 2. Install Docker ─────────────────────────────────────────────────────────
echo "[2/8] Installing Docker..."
sudo apt-get install -y -qq ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -qq
sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add ubuntu user to docker group (no sudo needed)
sudo usermod -aG docker ubuntu
echo "✓ Docker installed"

# ── 3. Install AWS CLI ────────────────────────────────────────────────────────
echo "[3/8] Installing AWS CLI..."
curl -s "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
sudo apt-get install -y -qq unzip
unzip -q awscliv2.zip
sudo ./aws/install
rm -rf aws awscliv2.zip
echo "✓ AWS CLI installed: $(aws --version)"

# ── 4. Install Nginx ──────────────────────────────────────────────────────────
echo "[4/8] Installing Nginx..."
sudo apt-get install -y -qq nginx
sudo systemctl enable nginx
echo "✓ Nginx installed"

# ── 5. Install Certbot (SSL) ──────────────────────────────────────────────────
echo "[5/8] Installing Certbot..."
sudo apt-get install -y -qq certbot python3-certbot-nginx
echo "✓ Certbot installed"

# ── 6. Create directories & Docker volumes ────────────────────────────────────
echo "[6/8] Creating directories and Docker volumes..."
mkdir -p /home/ubuntu/crm-backend
docker volume create uploads_data 2>/dev/null || true
docker volume create redis_data 2>/dev/null || true
echo "✓ Directories and volumes ready"

# ── 7. Create .env file (placeholder) ────────────────────────────────────────
echo "[7/8] Creating .env placeholder..."
if [ ! -f /home/ubuntu/crm-backend/.env ]; then
  cat > /home/ubuntu/crm-backend/.env << 'ENVEOF'
# FILL IN YOUR ACTUAL VALUES
APP_NAME=Multi-Tenant CRM
APP_VERSION=1.0.0
DEBUG=false
MONGODB_URI=mongodb+srv://crmadmin:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
MASTER_DB_NAME=master_db
JWT_SECRET_KEY=CHANGE-THIS-TO-64-RANDOM-CHARS
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=1440
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7
ALLOWED_ORIGINS=["https://yourdomain.com"]
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxx
RAZORPAY_KEY_SECRET=your_secret
REDIS_URL=redis://:YOUR_REDIS_PASSWORD@redis:6379/0
REDIS_MAX_CONNECTIONS=10
REDIS_CACHE_TTL=300
REDIS_SESSION_TTL=86400
PASSWORD_MIN_LENGTH=8
BCRYPT_ROUNDS=12
TRIAL_DAYS=14
ENVEOF
  echo "  ⚠️  Edit /home/ubuntu/crm-backend/.env with your actual values!"
else
  echo "  .env already exists, skipping"
fi

# ── 8. Setup AWS credentials for ECR pull ────────────────────────────────────
echo "[8/8] Configure AWS credentials for ECR access..."
echo "  Run: aws configure"
echo "  Enter your AWS Access Key ID and Secret Access Key"

echo ""
echo "============================================"
echo "  Setup Complete!"
echo "============================================"
echo ""
echo "NEXT STEPS:"
echo "  1. Edit /home/ubuntu/crm-backend/.env with your actual values"
echo "  2. Run: aws configure   (enter your AWS IAM credentials)"
echo "  3. Copy Nginx config:   sudo cp nginx/backend.conf /etc/nginx/sites-available/crm-backend"
echo "  4. Enable Nginx site:   sudo ln -s /etc/nginx/sites-available/crm-backend /etc/nginx/sites-enabled/"
echo "  5. Test Nginx:          sudo nginx -t && sudo systemctl reload nginx"
echo "  6. Get SSL cert:        sudo certbot --nginx -d api.yourdomain.com"
  7. Add REDIS_PASSWORD secret in GitHub → Settings → Secrets
  8. Push to GitHub main branch to trigger CI/CD deployment"
echo ""
echo "⚠️  Log out and back in for Docker group changes to take effect"
