# Niyan HireFlow — AWS Deployment Guide

> Complete, step-by-step guide to deploy the full stack on AWS.  
> Architecture: FastAPI backend on EC2 · React frontend on S3 + CloudFront · MongoDB Atlas · Redis on EC2

---

## Prerequisites — AWS Services Required

| Service | Purpose |
|---------|---------|
| EC2 (t3.small) | Run FastAPI backend + Redis |
| S3 | Host React frontend + store uploaded files (resumes) |
| CloudFront | CDN + HTTPS for frontend |
| MongoDB Atlas | Production database (external) |
| Route 53 | DNS management |
| ACM (Certificate Manager) | Free SSL certificates |
| IAM | Least-privilege credentials for S3 uploads |

---

## Required Environment Variables

### Backend (fill in `backend/.env` on the server)

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB Atlas connection string |
| `MASTER_DB_NAME` | Yes | Master database name (`master_db`) |
| `JWT_SECRET_KEY` | Yes | Min 64-char random string — generate with `python -c "import secrets; print(secrets.token_hex(64))"` |
| `JWT_ALGORITHM` | Yes | `HS256` |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Yes | `1440` (24 hours) |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | Yes | `7` |
| `ALLOWED_ORIGINS` | Yes | `["https://yourdomain.com"]` |
| `REDIS_URL` | Yes | `redis://:PASSWORD@127.0.0.1:6379/0` |
| `AWS_ACCESS_KEY_ID` | Yes | IAM user key for S3 uploads |
| `AWS_SECRET_ACCESS_KEY` | Yes | IAM user secret for S3 uploads |
| `AWS_REGION` | Yes | `ap-south-1` |
| `AWS_S3_BUCKET_NAME` | Yes | S3 bucket for uploaded files |
| `SMTP_USERNAME` | For email | Gmail address |
| `SMTP_PASSWORD` | For email | Gmail App Password (16 chars, no spaces) |
| `SMTP_FROM_EMAIL` | For email | Sender email address |
| `FERNET_SECRET_KEY` | Yes | Fernet key for encrypting tenant SMTP passwords |
| `FRONTEND_URL` | Yes | `https://yourdomain.com` |
| `RAZORPAY_KEY_ID` | For payments | Live key from razorpay.com |
| `RAZORPAY_KEY_SECRET` | For payments | Live secret from razorpay.com |
| `ANTHROPIC_API_KEY` | For AI resume parsing | From console.anthropic.com |
| `DEBUG` | Yes | `false` in production |

### Frontend (baked into build via `frontend/.env.production`)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | `/api/v1` (when frontend + backend share domain via CloudFront) or `https://api.yourdomain.com/api/v1` |
| `VITE_RAZORPAY_KEY_ID` | Live Razorpay public key |
| `VITE_APP_NAME` | `Niyan HireFlow` |

---

## Step 1 — MongoDB Atlas Setup

1. Create account at https://www.mongodb.com/atlas
2. Create cluster → choose **AWS ap-south-1 (Mumbai)**
3. **Database Access** → Add user `crmadmin` with Atlas Admin role → save password
4. **Network Access** → allow your EC2 Elastic IP (add after Step 3)
5. **Connect** → Drivers → Python → copy connection string
6. Replace `<password>` in the string with your actual password

---

## Step 2 — AWS Setup

### 2a. Create IAM User for S3 Uploads

1. IAM → Users → Add user: `niyan-hireflow-s3`
2. Attach policy — create inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::niyan-hireflow-uploads/*"
    }
  ]
}
```

3. Create access key → download CSV → save `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`

### 2b. Create S3 Bucket for File Uploads

1. S3 → Create bucket: `niyan-hireflow-uploads`
2. Region: `ap-south-1`
3. **Block Public Access**: Keep all blocked (files accessed via presigned URLs or direct S3 URL when bucket policy allows)
4. Add bucket policy for public-read on uploads:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadFiles",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::niyan-hireflow-uploads/*"
  }]
}
```

### 2c. Configure AWS CLI Locally

```powershell
# Windows
winget install Amazon.AWSCLI
aws configure
# Enter: Access Key, Secret Key, Region: ap-south-1, Output: json
```

---

## Step 3 — EC2 Server Setup

### 3a. Launch Instance

- AMI: **Ubuntu 22.04 LTS**
- Type: **t3.small** (2 vCPU, 2 GB RAM)
- Security Group inbound rules:

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 22 | TCP | Your IP only | SSH |
| 80 | TCP | 0.0.0.0/0 | HTTP |
| 443 | TCP | 0.0.0.0/0 | HTTPS |

- Storage: 20 GB gp3
- Key pair: create `niyan-key.pem` — download and store safely

### 3b. Allocate Elastic IP

EC2 → Elastic IPs → Allocate → Associate to your instance. Note this IP.

### 3c. Connect

```powershell
# Fix key permissions (Windows)
icacls "C:\Users\You\.ssh\niyan-key.pem" /inheritance:r /grant:r "$($env:USERNAME):(R)"

ssh -i "C:\Users\You\.ssh\niyan-key.pem" ubuntu@<ELASTIC_IP>
```

### 3d. Server Software Setup

```bash
sudo apt update && sudo apt upgrade -y

# Python 3.12
sudo apt install -y software-properties-common
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt update
sudo apt install -y python3.12 python3.12-venv python3.12-dev

# Nginx + utilities
sudo apt install -y nginx git unzip curl

# Docker (for Redis)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
# Log out and back in, then verify:
docker --version
```

### 3e. Start Redis via Docker

```bash
docker volume create redis_data

# Replace YOUR_REDIS_PASSWORD with a strong password
docker run -d \
  --name hireflow_redis \
  --restart always \
  -v redis_data:/data \
  -p 127.0.0.1:6379:6379 \
  redis:7.2-alpine \
  redis-server \
    --requirepass YOUR_REDIS_PASSWORD \
    --maxmemory 256mb \
    --maxmemory-policy allkeys-lru

docker exec hireflow_redis redis-cli -a YOUR_REDIS_PASSWORD ping
# Should return: PONG
```

---

## Step 4 — Deploy Backend

### 4a. Upload Code (from your local machine)

```powershell
cd d:\crm-project
Compress-Archive -Path backend -DestinationPath backend.zip -Force
scp -i "C:\Users\You\.ssh\niyan-key.pem" backend.zip ubuntu@<ELASTIC_IP>:/home/ubuntu/
```

### 4b. Setup on Server

```bash
cd /home/ubuntu
unzip backend.zip
mv backend crm-backend
cd crm-backend

python3.12 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Create upload directories (used as local fallback when S3 is not configured)
mkdir -p uploads/resumes uploads/documents
```

### 4c. Create .env File

```bash
cp .env.production .env
nano .env
# Fill in every <REPLACE_...> placeholder with real values
```

Key values to fill:
- `MONGODB_URI` — Atlas connection string from Step 1
- `JWT_SECRET_KEY` — generate: `python3 -c "import secrets; print(secrets.token_hex(64))"`
- `REDIS_URL` — use the password from Step 3e
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` — from Step 2a
- `FERNET_SECRET_KEY` — generate: `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`

Secure the file:
```bash
chmod 600 .env
```

### 4d. Test Backend Manually

```bash
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
# Look for "Application startup complete"
# Test: curl http://localhost:8000/health
# Press Ctrl+C when confirmed working
```

### 4e. Create Systemd Service

```bash
sudo nano /etc/systemd/system/niyan-hireflow.service
```

Paste:
```ini
[Unit]
Description=Niyan HireFlow API
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/crm-backend
Environment="PATH=/home/ubuntu/crm-backend/venv/bin:/usr/bin:/bin"
EnvironmentFile=/home/ubuntu/crm-backend/.env
ExecStart=/home/ubuntu/crm-backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable niyan-hireflow
sudo systemctl start niyan-hireflow
sudo systemctl status niyan-hireflow   # should be "active (running)"
```

### 4f. Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/niyan-hireflow
```

Paste:
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        client_max_body_size 20M;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/niyan-hireflow /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
```

---

## Step 5 — Deploy Frontend

### 5a. Build Locally

```powershell
cd d:\crm-project\frontend

# Verify .env.production has correct VITE_API_URL
# If frontend and backend are on separate domains:
# VITE_API_URL=https://api.yourdomain.com/api/v1

npm install
npm run build
# Output: frontend/dist/
```

### 5b. Create S3 Bucket for Frontend

1. S3 → Create bucket: `niyan-hireflow-frontend` (globally unique name)
2. Region: `ap-south-1`
3. Uncheck **Block all public access** → acknowledge
4. **Properties** → Static website hosting → Enable
   - Index document: `index.html`
   - Error document: `index.html`
5. **Permissions** → Bucket policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::niyan-hireflow-frontend/*"
  }]
}
```

### 5c. Upload Build to S3

```powershell
aws s3 sync d:\crm-project\frontend\dist s3://niyan-hireflow-frontend --delete
```

### 5d. Create CloudFront Distribution

1. CloudFront → Create Distribution
2. Origin: select `niyan-hireflow-frontend` S3 bucket
3. **Viewer protocol**: Redirect HTTP to HTTPS
4. **Default root object**: `index.html`
5. **Alternate domain names**: `yourdomain.com`, `www.yourdomain.com`
6. **SSL certificate**: Request from ACM (must be in **us-east-1**)
7. After creation → **Error pages** tab:
   - 403 → `/index.html` → 200 OK
   - 404 → `/index.html` → 200 OK
8. Note your CloudFront domain: `dxxxxxx.cloudfront.net`

### 5e. Add API Behavior to CloudFront (optional — single domain setup)

If you want `yourdomain.com/api/...` to proxy to your EC2 backend:

1. CloudFront → your distribution → **Origins** → Create origin
   - Domain: `api.yourdomain.com`
   - Protocol: HTTPS only
2. **Behaviors** → Create behavior
   - Path pattern: `/api/*`
   - Origin: `api.yourdomain.com`
   - Cache policy: **CachingDisabled**
   - Origin request policy: **AllViewer**
   - Allowed methods: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE

---

## Step 6 — Domain & SSL Setup

### 6a. Route 53 Hosted Zone

1. Route 53 → Hosted zones → Create: `yourdomain.com`
2. Copy the 4 NS records → update at your domain registrar

### 6b. DNS Records

| Name | Type | Value |
|------|------|-------|
| `yourdomain.com` | A (Alias) | CloudFront distribution |
| `www.yourdomain.com` | A (Alias) | CloudFront distribution |
| `api.yourdomain.com` | A | EC2 Elastic IP |

### 6c. SSL for Backend (Certbot)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
sudo certbot renew --dry-run   # verify auto-renewal works
```

### 6d. ACM Certificate for CloudFront

1. Switch to **us-east-1** region in AWS Console
2. ACM → Request certificate → `yourdomain.com` + `*.yourdomain.com`
3. DNS validation → Create records in Route 53 (one click)
4. Wait for **Issued** status → attach to CloudFront distribution

---

## Step 7 — Database Initialization

Run once on a fresh database to seed plans and super admin:

```bash
ssh -i niyan-key.pem ubuntu@<ELASTIC_IP>
cd /home/ubuntu/crm-backend
source venv/bin/activate
python scripts/seed_db.py
```

This creates:
- Default subscription plans
- Super admin account (`superadmin` / `SuperAdmin@123`)
- Database indexes

**Change the super admin password immediately after first login.**

---

## Step 8 — Health Check Verification

After deployment, verify everything works:

```bash
# Backend health
curl https://api.yourdomain.com/health
# Expected: {"status": "healthy", "database": "connected", "version": "5.0.0"}

# Frontend
curl -I https://yourdomain.com
# Expected: HTTP/2 200

# API via CloudFront (if configured)
curl https://yourdomain.com/api/v1/health
```

Then in the browser:
- [ ] `https://yourdomain.com` → login page loads
- [ ] Login with super admin credentials works
- [ ] Create a test tenant
- [ ] Login as tenant owner
- [ ] Upload a resume → AI parsing works
- [ ] Email verification email arrives

---

## Step 9 — Updating After Code Changes

### Backend Update

```powershell
# Local machine
cd d:\crm-project
Compress-Archive -Path backend -DestinationPath backend-update.zip -Force
scp -i "C:\Users\You\.ssh\niyan-key.pem" backend-update.zip ubuntu@<ELASTIC_IP>:/home/ubuntu/
```

```bash
# On server
cd /home/ubuntu
unzip -o backend-update.zip -d update-temp
cp crm-backend/.env update-temp/backend/.env
mkdir -p update-temp/backend/uploads/resumes update-temp/backend/uploads/documents
rm -rf crm-backend-old; mv crm-backend crm-backend-old
mv update-temp/backend crm-backend
cd crm-backend && source venv/bin/activate && pip install -r requirements.txt -q
sudo systemctl restart niyan-hireflow
sudo journalctl -u niyan-hireflow -f --no-pager   # watch startup logs
rm -rf /home/ubuntu/backend-update.zip /home/ubuntu/update-temp
```

### Frontend Update

```powershell
cd d:\crm-project\frontend
npm run build
aws s3 sync dist s3://niyan-hireflow-frontend --delete
aws cloudfront create-invalidation --distribution-id <DIST_ID> --paths "/*"
```

---

## Security Checklist

- [ ] `DEBUG=false` in backend `.env`
- [ ] `JWT_SECRET_KEY` is 64+ random characters
- [ ] `FERNET_SECRET_KEY` is a generated Fernet key
- [ ] `.env` permissions: `chmod 600 /home/ubuntu/crm-backend/.env`
- [ ] EC2 Security Group: SSH (port 22) restricted to your IP only
- [ ] EC2 Security Group: port 8000 is NOT open publicly (Nginx handles routing)
- [ ] MongoDB Atlas Network Access: only EC2 Elastic IP whitelisted
- [ ] S3 upload bucket: only IAM user `niyan-hireflow-s3` has write access
- [ ] SSL certificates active on both `yourdomain.com` and `api.yourdomain.com`
- [ ] Razorpay LIVE keys in production (not test keys)
- [ ] Super admin default password changed

---

## Useful Commands

```bash
# Backend service
sudo systemctl status niyan-hireflow
sudo systemctl restart niyan-hireflow
sudo journalctl -u niyan-hireflow -f --no-pager

# Redis
docker ps
docker logs hireflow_redis --tail 50

# Nginx
sudo nginx -t
sudo systemctl restart nginx
sudo tail -f /var/log/nginx/error.log

# Disk
df -h
du -sh /home/ubuntu/crm-backend/uploads

# Generate secrets
python3 -c "import secrets; print(secrets.token_hex(64))"
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```
