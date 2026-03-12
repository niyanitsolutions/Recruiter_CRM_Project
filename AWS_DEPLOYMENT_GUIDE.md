# AWS Deployment Guide — CRM Platform
### Full Stack: FastAPI Backend + React Frontend + MongoDB

---

## Architecture Overview

```
Users (Browser / Mobile)
        │
        ▼
  ┌─────────────┐       ┌──────────────────┐
  │  CloudFront │       │   Route 53 (DNS)  │
  │  (CDN/HTTPS)│◄──────│  yourdomain.com   │
  └──────┬──────┘       └──────────────────┘
         │
    ┌────┴───────────────────────┐
    │                            │
    ▼                            ▼
┌─────────┐              ┌──────────────┐
│   S3    │              │     EC2      │
│(Frontend│              │  (Backend)   │
│ React)  │              │  FastAPI     │
└─────────┘              └──────┬───────┘
                                │
                                ▼
                        ┌──────────────┐
                        │ MongoDB Atlas │
                        │  (Database)  │
                        └──────────────┘
```

**Services Used:**
| Service | Purpose | Cost (approx) |
|---------|---------|--------------|
| EC2 (t3.small) | Run FastAPI backend | ~$15/month |
| S3 | Host React frontend | ~$1/month |
| CloudFront | CDN + HTTPS for frontend & API | ~$1–5/month |
| MongoDB Atlas (M10) | Database | ~$57/month |
| Route 53 | DNS management | ~$0.50/month |
| ACM | Free SSL certificates | Free |

**Total estimated: ~$75–80/month**

---

## PART 1 — MongoDB Atlas Setup (Database)

### Step 1: Create MongoDB Atlas Account

1. Go to [https://www.mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Click **"Try Free"** → Sign up with email
3. Choose **"Build a Database"**
4. Select **M10 Dedicated** (recommended for production, $57/month)
   - For testing: M0 Free tier works temporarily
5. Choose **AWS** as cloud provider
6. Choose region: **ap-south-1** (Mumbai) — closest to India
7. Click **"Create Cluster"** — takes 3–5 minutes

### Step 2: Create Database User

1. Left sidebar → **"Database Access"**
2. Click **"Add New Database User"**
3. Set:
   - Username: `crmadmin`
   - Password: (generate a strong password — **SAVE THIS**)
   - Role: **Atlas Admin**
4. Click **"Add User"**

### Step 3: Allow Network Access

1. Left sidebar → **"Network Access"**
2. Click **"Add IP Address"**
3. For now click **"Allow Access from Anywhere"** (0.0.0.0/0)
   - Later, replace this with your EC2's Elastic IP
4. Click **"Confirm"**

### Step 4: Get Connection String

1. Left sidebar → **"Database"** → Click **"Connect"**
2. Choose **"Connect your application"**
3. Driver: **Python**, Version: **3.12 or later**
4. Copy the connection string — looks like:
   ```
   mongodb+srv://crmadmin:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. Replace `<password>` with your actual password
6. **Save this string** — you'll need it for the backend `.env`

---

## PART 2 — AWS Account Setup

### Step 1: Create AWS Account

1. Go to [https://aws.amazon.com](https://aws.amazon.com) → **"Create an AWS Account"**
2. Enter email, account name, credit card
3. Choose **Basic (Free) Support**

### Step 2: Create IAM User (for security — never use root account)

1. Go to **IAM** service in AWS Console
2. Click **Users** → **"Add users"**
3. Username: `crm-deploy`
4. Check: **"Access key - Programmatic access"**
5. Next → **"Attach existing policies"** → Select **AdministratorAccess**
6. Create user → **Download the CSV** (Access Key ID + Secret — save this!)

### Step 3: Install AWS CLI on your machine

```bash
# Windows (PowerShell as Admin):
winget install Amazon.AWSCLI

# Verify:
aws --version

# Configure:
aws configure
# Enter: Access Key ID, Secret Access Key, Region: ap-south-1, Output: json
```

---

## PART 3 — EC2 Setup (Backend Server)

### Step 1: Launch EC2 Instance

1. Go to AWS Console → **EC2** → **"Launch Instance"**
2. Settings:
   - Name: `crm-backend`
   - AMI: **Ubuntu Server 22.04 LTS** (free tier eligible, select it)
   - Instance type: **t3.small** (2 vCPU, 2GB RAM — enough for production)
   - Key pair: Click **"Create new key pair"**
     - Name: `crm-key`
     - Type: RSA, Format: .pem
     - **Download and save `crm-key.pem` — you CANNOT download again!**
   - Network settings:
     - Allow SSH (port 22) — "My IP" only
     - Allow HTTPS (port 443)
     - Allow HTTP (port 80)
     - Allow Custom TCP: **port 8000** (FastAPI) — from anywhere
   - Storage: 20 GB gp3
3. Click **"Launch Instance"**

### Step 2: Allocate Elastic IP (fixed IP address)

1. EC2 → **Elastic IPs** → **"Allocate Elastic IP address"** → Allocate
2. Select it → **"Associate Elastic IP"** → select your `crm-backend` instance
3. **Note down this IP** (e.g., `13.233.xx.xx`) — this is your server's permanent IP

### Step 3: Connect to Server via SSH

```bash
# On your local machine:

# Fix key permissions (Windows PowerShell):
icacls crm-key.pem /inheritance:r /grant:r "$($env:USERNAME):(R)"

# Connect:
ssh -i crm-key.pem ubuntu@13.233.xx.xx
```

### Step 4: Install Required Software on Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Python 3.12
sudo apt install -y software-properties-common
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt update
sudo apt install -y python3.12 python3.12-venv python3.12-dev python3-pip

# Install Nginx (reverse proxy)
sudo apt install -y nginx

# Install Git
sudo apt install -y git

# Verify
python3.12 --version
nginx -v
git --version
```

### Step 5: Upload & Setup Backend Code

**Option A — Upload from your local machine (recommended for first deploy):**

```bash
# On your LOCAL machine — zip the backend folder:
# (Run in PowerShell from d:\crm-project)
Compress-Archive -Path backend -DestinationPath backend.zip

# Upload to server:
scp -i crm-key.pem backend.zip ubuntu@13.233.xx.xx:/home/ubuntu/
```

**On the server:**

```bash
# Extract
cd /home/ubuntu
unzip backend.zip
mv backend crm-backend
cd crm-backend

# Create Python virtual environment
python3.12 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Step 6: Create Environment File (.env)

```bash
# On the server:
cd /home/ubuntu/crm-backend
nano .env
```

Paste the following (replace with your actual values):

```env
# MongoDB
MONGODB_URL=mongodb+srv://crmadmin:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
MASTER_DB_NAME=crm_master_db

# JWT Security — generate a random 64-char string
SECRET_KEY=your-very-long-random-secret-key-minimum-64-chars-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# App
ENVIRONMENT=production
ALLOWED_ORIGINS=["https://yourdomain.com","https://www.yourdomain.com","http://13.233.xx.xx"]

# Razorpay (get from razorpay.com dashboard)
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxx
RAZORPAY_KEY_SECRET=your_razorpay_secret

# Email (optional — for password reset)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASSWORD=your_app_password
```

Save: `Ctrl+X` → `Y` → Enter

### Step 7: Create Systemd Service (auto-start on reboot)

```bash
sudo nano /etc/systemd/system/crm-backend.service
```

Paste:

```ini
[Unit]
Description=CRM FastAPI Backend
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/crm-backend
Environment="PATH=/home/ubuntu/crm-backend/venv/bin"
ExecStart=/home/ubuntu/crm-backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable crm-backend
sudo systemctl start crm-backend

# Check status
sudo systemctl status crm-backend

# View logs
sudo journalctl -u crm-backend -f
```

### Step 8: Configure Nginx (Reverse Proxy + HTTPS)

```bash
sudo nano /etc/nginx/sites-available/crm-backend
```

Paste:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 50M;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/crm-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 9: Install SSL Certificate (HTTPS — Free)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate (replace with your domain)
sudo certbot --nginx -d api.yourdomain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

---

## PART 4 — S3 + CloudFront (Frontend)

### Step 1: Build React Frontend

**On your LOCAL machine:**

```bash
cd d:\crm-project\frontend

# Create production .env
# Create file: frontend/.env.production
```

Create `frontend/.env.production`:

```env
VITE_API_URL=https://api.yourdomain.com/api/v1
```

```bash
# Build
npm run build
# Output folder: frontend/dist/
```

### Step 2: Create S3 Bucket

1. AWS Console → **S3** → **"Create bucket"**
2. Bucket name: `crm-frontend-yourdomain` (must be globally unique)
3. Region: `ap-south-1`
4. **Uncheck** "Block all public access" → confirm
5. Click **"Create bucket"**

**Enable static website hosting:**
1. Click your bucket → **Properties** tab
2. Scroll down → **"Static website hosting"** → Edit
3. Enable → Index document: `index.html` → Error document: `index.html`
4. Save

**Upload files:**

```bash
# Using AWS CLI on your local machine:
aws s3 sync d:\crm-project\frontend\dist s3://crm-frontend-yourdomain --delete
```

**Set bucket policy (public read):**
1. S3 bucket → **Permissions** tab → **Bucket Policy** → Edit
2. Paste:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::crm-frontend-yourdomain/*"
    }
  ]
}
```

### Step 3: Create CloudFront Distribution

1. AWS Console → **CloudFront** → **"Create Distribution"**
2. Settings:
   - Origin domain: select your S3 bucket
   - Origin access: **"Legacy access identities"** → Create new OAI
   - Default root object: `index.html`
   - Viewer protocol: **Redirect HTTP to HTTPS**
   - Alternate domain names (CNAMEs): `yourdomain.com`, `www.yourdomain.com`
   - SSL certificate: **"Request or import a certificate with ACM"**
     - Go to ACM → Request certificate → Enter `yourdomain.com` and `*.yourdomain.com`
     - Validate via DNS → add CNAME records in your domain registrar
3. **Error pages** tab → Create custom error response:
   - 403 → `/index.html` → 200 (for React Router to work)
   - 404 → `/index.html` → 200
4. Click **"Create Distribution"**
5. Note the **CloudFront domain** (e.g., `d1abc123.cloudfront.net`)

---

## PART 5 — Domain & DNS Setup (Route 53)

### If you have a domain already:

1. AWS Console → **Route 53** → **Hosted Zones** → **"Create hosted zone"**
2. Domain name: `yourdomain.com` → Create
3. Note the **4 NS records** Route 53 gives you
4. Go to your domain registrar (GoDaddy/Namecheap) → Update nameservers to these 4 NS records

**Create DNS Records:**
1. In Route 53 Hosted Zone → **"Create record"**:
   - Frontend: `yourdomain.com` → Type: A → Alias → CloudFront distribution
   - Frontend www: `www.yourdomain.com` → Type: A → Alias → same CloudFront
   - Backend API: `api.yourdomain.com` → Type: A → Value: your EC2 Elastic IP

---

## PART 6 — Update After Bug Fixes & Code Changes

### Update Backend (FastAPI)

```bash
# 1. On your LOCAL machine — zip updated backend:
Compress-Archive -Path d:\crm-project\backend -DestinationPath backend-update.zip -Force

# 2. Upload to server:
scp -i crm-key.pem backend-update.zip ubuntu@13.233.xx.xx:/home/ubuntu/

# 3. SSH into server:
ssh -i crm-key.pem ubuntu@13.233.xx.xx

# 4. On server — replace files and restart:
cd /home/ubuntu
unzip -o backend-update.zip -d /home/ubuntu/crm-backend-new

# Preserve the .env file!
cp /home/ubuntu/crm-backend/.env /home/ubuntu/crm-backend-new/backend/.env

# Replace old code
rm -rf /home/ubuntu/crm-backend-old 2>/dev/null
mv /home/ubuntu/crm-backend /home/ubuntu/crm-backend-old
mv /home/ubuntu/crm-backend-new/backend /home/ubuntu/crm-backend

# Install any new dependencies
cd /home/ubuntu/crm-backend
source venv/bin/activate
pip install -r requirements.txt

# Restart service
sudo systemctl restart crm-backend
sudo systemctl status crm-backend
```

### Update Frontend (React)

```bash
# 1. On your LOCAL machine — rebuild:
cd d:\crm-project\frontend
npm run build

# 2. Upload to S3:
aws s3 sync d:\crm-project\frontend\dist s3://crm-frontend-yourdomain --delete

# 3. Invalidate CloudFront cache (so users get new version):
aws cloudfront create-invalidation \
  --distribution-id YOUR_CLOUDFRONT_DIST_ID \
  --paths "/*"
```

### Quick Update Script (save as `deploy.sh` on local machine)

Create `d:\crm-project\deploy.bat`:

```batch
@echo off
echo === Deploying Frontend ===
cd d:\crm-project\frontend
call npm run build
aws s3 sync dist s3://crm-frontend-yourdomain --delete
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"

echo === Deploying Backend ===
Compress-Archive -Force -Path d:\crm-project\backend -DestinationPath d:\crm-project\backend-deploy.zip
scp -i d:\crm-key.pem d:\crm-project\backend-deploy.zip ubuntu@13.233.xx.xx:/home/ubuntu/
ssh -i d:\crm-key.pem ubuntu@13.233.xx.xx "cd /home/ubuntu && unzip -o backend-deploy.zip && cp crm-backend/.env backend/.env && rm -rf crm-backend && mv backend crm-backend && source crm-backend/venv/bin/activate && pip install -r crm-backend/requirements.txt -q && sudo systemctl restart crm-backend && echo DONE"

echo === Deployment Complete ===
```

---

## PART 7 — Monitoring & Logs

### View Backend Logs (real-time)

```bash
ssh -i crm-key.pem ubuntu@13.233.xx.xx
sudo journalctl -u crm-backend -f --no-pager
```

### View Nginx Logs

```bash
# Access logs
sudo tail -f /var/log/nginx/access.log

# Error logs
sudo tail -f /var/log/nginx/error.log
```

### Check Backend Health

```bash
curl https://api.yourdomain.com/health
# Should return: {"status": "healthy", ...}
```

### AWS CloudWatch (optional — automatic monitoring)

1. EC2 Console → your instance → **"Monitoring"** tab
2. Enable **"Detailed monitoring"**
3. CloudWatch → Create **Alarm** for CPU > 80% → notify via email

---

## PART 8 — Security Checklist

- [ ] EC2 Security Group: SSH only from your IP (not 0.0.0.0/0)
- [ ] MongoDB Atlas: Whitelist only your EC2 Elastic IP (remove 0.0.0.0/0)
- [ ] `.env` file: Never committed to Git — it's only on the server
- [ ] SECRET_KEY: Minimum 64 random characters
- [ ] SSL/HTTPS: Enabled on both frontend (CloudFront) and backend (Certbot)
- [ ] Razorpay: Use live keys only in production `.env`
- [ ] Regular backups: MongoDB Atlas has automatic daily backups on M10+

---

## PART 9 — Step-by-Step Quick Reference

```
Day 1 Setup Checklist:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 □ 1. Create MongoDB Atlas account + cluster
 □ 2. Create AWS account + IAM user
 □ 3. Install AWS CLI + configure
 □ 4. Launch EC2 (t3.small, Ubuntu 22.04)
 □ 5. Allocate Elastic IP → attach to EC2
 □ 6. SSH into EC2, install Python + Nginx
 □ 7. Upload backend code → setup .env
 □ 8. Create systemd service → start backend
 □ 9. Configure Nginx → restart
 □ 10. Request SSL cert via Certbot
 □ 11. Build React frontend (npm run build)
 □ 12. Create S3 bucket → upload dist/
 □ 13. Create CloudFront distribution
 □ 14. Setup Route 53 DNS
 □ 15. Test: https://yourdomain.com (frontend)
 □ 16. Test: https://api.yourdomain.com/docs (backend)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every Update Checklist:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 □ Frontend change → npm run build → s3 sync → cloudfront invalidate
 □ Backend change  → zip → scp → unzip → pip install → systemctl restart
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## PART 10 — Costs Summary (India/Mumbai region)

| Resource | Spec | Monthly Cost |
|----------|------|-------------|
| EC2 t3.small | 2 vCPU, 2GB, 20GB SSD | ~₹1,200 (~$15) |
| Elastic IP | Static IP | Free (when attached) |
| MongoDB Atlas M10 | 2GB RAM, 10GB storage | ~₹4,700 (~$57) |
| S3 | ~1GB frontend + transfers | ~₹50 (~$0.50) |
| CloudFront | CDN + 10GB transfer | ~₹200 (~$2) |
| Route 53 | 1 hosted zone | ~₹40 (~$0.50) |
| ACM SSL | Certificate | Free |
| **Total** | | **~₹6,200 (~$75)/month** |

> **Cost saving tip**: Use MongoDB Atlas M0 (free) for testing, upgrade to M10 before going live.

---

## Troubleshooting

### Backend not starting
```bash
# Check logs
sudo journalctl -u crm-backend -n 50 --no-pager
# Common issue: wrong .env path or missing dependency
```

### 502 Bad Gateway from Nginx
```bash
# Backend not running — restart it
sudo systemctl restart crm-backend
sudo systemctl status crm-backend
```

### React page shows blank / 403
```bash
# CloudFront error pages not configured
# Add custom error: 403 → /index.html → 200
# Also check S3 bucket policy
```

### MongoDB connection refused
```bash
# Check Atlas IP whitelist — add EC2 Elastic IP
# Check connection string in .env
# Test: python3 -c "from motor.motor_asyncio import AsyncIOMotorClient; print('ok')"
```

### Frontend API calls fail (CORS)
```bash
# Check ALLOWED_ORIGINS in .env includes your CloudFront/domain URL
# Restart backend after changing .env:
sudo systemctl restart crm-backend
```
