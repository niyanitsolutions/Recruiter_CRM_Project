# Niyan HireFlow — Complete AWS Deployment Guide
### From Zero to Live: FastAPI Backend + React Frontend on AWS EC2

---

## What You Will Build

```
Your Users (Browser)
        │
        ▼
  ┌─────────────┐        ┌─────────────────┐
  │ CloudFront  │        │   Route 53 DNS   │
  │  (HTTPS CDN)│◄───────│  yourdomain.com  │
  └──────┬──────┘        └─────────────────┘
         │
   ┌─────┴──────────────────────┐
   │                            │
   ▼                            ▼
┌─────────┐            ┌─────────────────────────────────┐
│   S3    │            │          EC2 (t3.small)          │
│(Frontend│            │  Ubuntu 22.04 — your server      │
│ React)  │            │                                  │
└─────────┘            │  ┌─────────┐  ┌──────────────┐  │
                       │  │  Nginx  │  │ FastAPI/Uvicorn│ │
                       │  │ (port80)│  │  (port 8000)  │ │
                       │  └────┬────┘  └──────┬───────┘  │
                       │       │              │           │
                       │       └──────────────┘           │
                       │              │                   │
                       │       ┌──────▼──────┐            │
                       │       │    Redis    │            │
                       │       │ (port 6379) │            │
                       │       └─────────────┘            │
                       └──────────────┬──────────────────┘
                                      │
                              ┌───────▼────────┐
                              │ MongoDB Atlas  │
                              │  (cloud DB)    │
                              └────────────────┘
```

**What runs where:**
| Component | Where | What it does |
|-----------|-------|-------------|
| React Frontend | S3 + CloudFront | Your UI — served globally via CDN |
| FastAPI Backend | EC2 (t3.small) | Your API — all business logic |
| Redis | EC2 (Docker container) | Sessions, caching, rate limiting |
| MongoDB | MongoDB Atlas | Your database — cloud-managed |
| Nginx | EC2 | Reverse proxy — routes traffic to API |
| SSL Certificate | AWS ACM (Free) | HTTPS for your domain |

**Estimated monthly cost (India/Mumbai):**
| Resource | Cost |
|----------|------|
| EC2 t3.small | ~₹1,200 ($15) |
| MongoDB Atlas M10 | ~₹4,700 ($57) |
| S3 + CloudFront | ~₹300 ($3) |
| Route 53 | ~₹40 ($0.50) |
| **Total** | **~₹6,250 ($75)/month** |

> Start with MongoDB Atlas M0 (FREE) for testing. Upgrade to M10 before going live with real users.

---

## BEFORE YOU START — Checklist of Accounts Needed

You need these 3 accounts (all free to create):

- [ ] **MongoDB Atlas** — https://www.mongodb.com/atlas (free signup)
- [ ] **AWS Account** — https://aws.amazon.com (needs credit card, charges only what you use)
- [ ] **Domain Name** — buy from GoDaddy, Namecheap, or use AWS Route 53 (~₹800-1200/year for .com)

---

## PART 1 — MongoDB Atlas (Your Database in the Cloud)

### Step 1.1 — Create Account and Cluster

1. Go to https://www.mongodb.com/atlas → Click **"Try Free"**
2. Sign up with your email → verify email
3. Choose **"Build a Database"**
4. Select tier:
   - **M0 Free** → for testing (0 cost, 512MB storage)
   - **M10 Dedicated** → for production (~$57/month, 10GB storage, automatic backups)
5. Cloud provider: **AWS**
6. Region: **ap-south-1 (Mumbai)** — fastest for India
7. Cluster name: `crm-cluster` → Click **"Create"**
8. Wait 3–5 minutes for cluster to be ready

### Step 1.2 — Create Database User

1. Left sidebar → **"Database Access"** → **"Add New Database User"**
2. Authentication method: **Password**
3. Username: `crmadmin`
4. Password: Click "Autogenerate Secure Password" → **COPY AND SAVE THIS**
5. Database User Privileges: **Atlas Admin**
6. Click **"Add User"**

### Step 1.3 — Allow Network Access

1. Left sidebar → **"Network Access"** → **"Add IP Address"**
2. For now: Click **"Allow Access from Anywhere"** (0.0.0.0/0)
3. Click **"Confirm"**

> You will tighten this to only your EC2's IP later (Step 3.10)

### Step 1.4 — Get Your Connection String

1. Left sidebar → **"Database"** → Click **"Connect"** on your cluster
2. Choose **"Drivers"** → Driver: **Python** → Version: **3.12 or later**
3. Copy the connection string. It looks like:
   ```
   mongodb+srv://crmadmin:<password>@crm-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
4. Replace `<password>` with your actual password from Step 1.2
5. **SAVE THIS STRING** — you will need it in Step 3.8

---

## PART 2 — AWS Account Setup

### Step 2.1 — Create AWS Account

1. Go to https://aws.amazon.com → **"Create an AWS Account"**
2. Enter email address, account name
3. Enter credit card (you will NOT be charged unless you use paid services)
4. Select **Basic (Free) Support**
5. Sign in to AWS Console

### Step 2.2 — Create IAM User (Never use root account for daily work)

1. In AWS Console search bar type **"IAM"** → Click IAM
2. Left sidebar → **"Users"** → **"Add users"**
3. Username: `crm-deploy`
4. Click **"Next"**
5. Select **"Attach policies directly"**
6. Search and check: **AdministratorAccess**
7. Click **"Next"** → **"Create user"**
8. Click on `crm-deploy` user → **"Security credentials"** tab
9. Click **"Create access key"** → Choose **"Command Line Interface (CLI)"**
10. Click through → **Download the .csv file** — SAVE THIS, you cannot download again!

### Step 2.3 — Install AWS CLI on Your Windows Machine

Open **Command Prompt or PowerShell** as Administrator:

```powershell
# Install AWS CLI
winget install Amazon.AWSCLI

# Close and reopen terminal, then verify
aws --version
# Should show: aws-cli/2.x.x ...

# Configure with your IAM credentials
aws configure
```

When prompted, enter:
```
AWS Access Key ID: (from the CSV you downloaded)
AWS Secret Access Key: (from the CSV)
Default region name: ap-south-1
Default output format: json
```

Verify it works:
```powershell
aws s3 ls
# Should return empty list (no error) — means credentials work
```

---

## PART 3 — EC2 Server Setup (Your Backend)

### Step 3.1 — Launch EC2 Instance

1. AWS Console → Search **"EC2"** → Click EC2
2. Click **"Launch Instance"**
3. Fill in settings:

   **Name:** `crm-backend`

   **Application and OS Images (AMI):**
   - Click **"Ubuntu"**
   - Select **"Ubuntu Server 22.04 LTS"** (free tier eligible)

   **Instance type:** `t3.small` (2 vCPU, 2 GB RAM)
   > For very low traffic, `t3.micro` (1GB) works too but may be slow under load

   **Key pair (login):**
   - Click **"Create new key pair"**
   - Name: `crm-key`
   - Key pair type: **RSA**
   - Private key format: **.pem**
   - Click **"Create key pair"**
   - **`crm-key.pem` will auto-download. Move it to `C:\Users\YourName\.ssh\crm-key.pem`**
   - **YOU CANNOT DOWNLOAD THIS AGAIN. Guard it like a password.**

   **Network settings — click "Edit":**
   - VPC: leave as default
   - Subnet: leave as default
   - Auto-assign public IP: **Enable**
   - Firewall (Security Group): **Create security group**
   - Security group name: `crm-sg`
   - Add these rules:
     | Type | Port | Source | Why |
     |------|------|--------|-----|
     | SSH | 22 | My IP | SSH access (your current IP only) |
     | HTTP | 80 | 0.0.0.0/0 | Web traffic |
     | HTTPS | 443 | 0.0.0.0/0 | Secure web traffic |
     | Custom TCP | 8000 | 0.0.0.0/0 | FastAPI (temporary — remove after Nginx setup) |

   **Configure storage:**
   - 20 GB, gp3

4. Click **"Launch Instance"**
5. Wait 1–2 minutes → Instance state will show **"Running"**

### Step 3.2 — Allocate Elastic IP (Fixed Public IP)

Without this, your server's IP changes every time it restarts.

1. EC2 Console → Left sidebar → **"Elastic IPs"**
2. Click **"Allocate Elastic IP address"** → **"Allocate"**
3. Select the new Elastic IP → **"Actions"** → **"Associate Elastic IP address"**
4. Instance: select `crm-backend`
5. Click **"Associate"**
6. **Note down your Elastic IP** — example: `13.233.45.67` (yours will be different)
   - This is your server's permanent IP address
   - You will use this everywhere below

### Step 3.3 — Connect to Your Server via SSH

On your Windows machine, open **PowerShell**:

```powershell
# Fix key file permissions (Windows requires this)
icacls "C:\Users\YourName\.ssh\crm-key.pem" /inheritance:r
icacls "C:\Users\YourName\.ssh\crm-key.pem" /grant:r "$($env:USERNAME):(R)"

# Connect (replace 13.233.45.67 with YOUR Elastic IP)
ssh -i "C:\Users\YourName\.ssh\crm-key.pem" ubuntu@13.233.45.67
```

You should see a Linux terminal prompt like: `ubuntu@ip-172-31-xx-xx:~$`

You are now inside your AWS server. All commands below run ON THE SERVER unless noted otherwise.

### Step 3.4 — Update the Server

```bash
# Always run this first on a fresh server
sudo apt update && sudo apt upgrade -y
```
> This takes 2–3 minutes. Press Enter if prompted about restarting services.

### Step 3.5 — Install Docker (We use Docker for Redis and optional backend container)

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add ubuntu user to docker group (so you don't need sudo every time)
sudo usermod -aG docker ubuntu

# Log out and back in for the group change to take effect
exit
```

Reconnect:
```powershell
ssh -i "C:\Users\YourName\.ssh\crm-key.pem" ubuntu@13.233.45.67
```

Verify Docker works:
```bash
docker --version
# Docker version 24.x.x
```

### Step 3.6 — Install Python 3.12 and Nginx

```bash
# Install Python 3.12
sudo apt install -y software-properties-common
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt update
sudo apt install -y python3.12 python3.12-venv python3.12-dev

# Install Nginx
sudo apt install -y nginx

# Install other utilities
sudo apt install -y git unzip curl

# Verify
python3.12 --version    # Python 3.12.x
nginx -v                # nginx/1.18.x
```

### Step 3.7 — Start Redis via Docker

Redis is used for caching, sessions, and rate limiting.

```bash
# Create a persistent volume for Redis data
docker volume create redis_data

# Start Redis container
# IMPORTANT: Replace YOUR_REDIS_PASSWORD with a strong password (e.g., RedisPass@2024!)
docker run -d \
  --name crm_redis \
  --restart always \
  -v redis_data:/data \
  -p 127.0.0.1:6379:6379 \
  redis:7.2-alpine \
  redis-server \
    --requirepass YOUR_REDIS_PASSWORD \
    --maxmemory 256mb \
    --maxmemory-policy allkeys-lru \
    --save 60 1

# Verify Redis is running
docker ps
# Should show crm_redis as "Up"

# Test Redis connection
docker exec crm_redis redis-cli -a YOUR_REDIS_PASSWORD ping
# Should return: PONG
```

**Save your Redis password** — you'll need it in the .env file.

### Step 3.8 — Upload and Setup Backend Code

**On your LOCAL Windows machine** (open a NEW PowerShell window — not the SSH session):

```powershell
# Navigate to your project
cd d:\crm-project

# Create a zip of the backend folder
Compress-Archive -Path backend -DestinationPath backend.zip -Force

# Upload to your EC2 server
scp -i "C:\Users\YourName\.ssh\crm-key.pem" backend.zip ubuntu@13.233.45.67:/home/ubuntu/
```

**Back on the server** (SSH session):

```bash
cd /home/ubuntu

# Extract
unzip backend.zip
mv backend crm-backend
cd crm-backend

# Create Python virtual environment
python3.12 -m venv venv

# Activate it
source venv/bin/activate

# Your prompt will now show (venv) at the start

# Install all Python dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

This takes 3–5 minutes. You'll see packages being installed.

### Step 3.9 — Create the .env File on the Server

```bash
# Make sure you are in the backend directory
cd /home/ubuntu/crm-backend

# Create the environment file
nano .env
```

Copy and paste the following, replacing ALL values marked with `<REPLACE>`:

```env
# ─── Application ─────────────────────────────────────────────────────────────
APP_NAME=Niyan HireFlow
APP_VERSION=1.0.0
DEBUG=false

# ─── MongoDB Atlas ───────────────────────────────────────────────────────────
# Paste your MongoDB connection string from Step 1.4
MONGODB_URI=mongodb+srv://crmadmin:<REPLACE_WITH_YOUR_ATLAS_PASSWORD>@crm-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
MASTER_DB_NAME=crm_master_db

# ─── JWT Security ────────────────────────────────────────────────────────────
# Generate a strong random key — run this command in PowerShell on your local machine:
# python -c "import secrets; print(secrets.token_hex(64))"
JWT_SECRET_KEY=<REPLACE_WITH_64_CHAR_RANDOM_STRING>
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=1440
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# ─── CORS — Allowed Origins ───────────────────────────────────────────────────
# Add your domain here — use your CloudFront domain until you have a custom domain
# Example with domain: ["https://yourdomain.com","https://www.yourdomain.com"]
# Example with CloudFront: ["https://d1abc123.cloudfront.net"]
ALLOWED_ORIGINS=["https://yourdomain.com","https://www.yourdomain.com"]

# ─── Redis ───────────────────────────────────────────────────────────────────
# Use the password you set in Step 3.7
REDIS_URL=redis://:YOUR_REDIS_PASSWORD@127.0.0.1:6379/0

# ─── File Uploads ────────────────────────────────────────────────────────────
UPLOAD_DIR=uploads

# ─── Email / SMTP (Gmail) ────────────────────────────────────────────────────
EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=yourcompany@gmail.com
# Gmail App Password — NOT your normal password
# Get it: Google Account → Security → 2FA → App Passwords → Create for "Mail"
SMTP_PASSWORD=xxxx xxxx xxxx xxxx
SMTP_FROM_EMAIL=yourcompany@gmail.com
SMTP_FROM_NAME=Niyan HireFlow
SMTP_TIMEOUT=15

EMAIL_VERIFICATION_ENABLED=true

# ─── Frontend URL (for email links) ──────────────────────────────────────────
FRONTEND_URL=https://yourdomain.com

# ─── Razorpay Payments ───────────────────────────────────────────────────────
# Get from razorpay.com dashboard → Settings → API Keys
# Use LIVE keys in production (not test keys)
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=<REPLACE_WITH_RAZORPAY_SECRET>

# ─── Anthropic AI (Resume Parsing) ───────────────────────────────────────────
# Get from console.anthropic.com → API Keys
ANTHROPIC_API_KEY=sk-ant-<REPLACE_WITH_YOUR_KEY>

# ─── Fernet Key (tenant SMTP encryption) ─────────────────────────────────────
# Generate once: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Run that command in your LOCAL terminal and paste the output here
FERNET_SECRET_KEY=<REPLACE_WITH_GENERATED_FERNET_KEY>

# ─── Plan Settings ───────────────────────────────────────────────────────────
TRIAL_DAYS=14
DEFAULT_SELLER_MARGIN=20.0
```

Save and exit: press `Ctrl+X` → `Y` → `Enter`

**Verify the file was saved:**
```bash
cat .env | head -5
# Should show the first 5 lines
```

### Step 3.10 — Create Uploads Directory

```bash
mkdir -p /home/ubuntu/crm-backend/uploads/resumes
mkdir -p /home/ubuntu/crm-backend/uploads/documents
```

### Step 3.11 — Test the Backend Manually

```bash
cd /home/ubuntu/crm-backend
source venv/bin/activate

# Run the server manually first to check for errors
uvicorn app.main:app --host 0.0.0.0 --port 8000

# You should see output like:
# INFO:     Started server process [xxxx]
# INFO:     Waiting for application startup.
# Starting CRM API Server...
# Connected to MongoDB
# Redis initialized
# INFO:     Application startup complete.
# INFO:     Uvicorn running on http://0.0.0.0:8000
```

If you see errors here, fix them before proceeding. Common issues:
- MongoDB connection error → check your `MONGODB_URI` in .env
- Redis connection error → check `REDIS_URL` and that Docker Redis is running
- Module not found → run `pip install -r requirements.txt` again

Once it's running, test it from your local browser:
```
http://13.233.45.67:8000/health
```
Should return: `{"status": "healthy", ...}`

Stop the server: `Ctrl+C`

### Step 3.12 — Create Systemd Service (Auto-start on Server Reboot)

```bash
sudo nano /etc/systemd/system/crm-backend.service
```

Paste exactly:
```ini
[Unit]
Description=Niyan HireFlow FastAPI Backend
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/crm-backend
Environment="PATH=/home/ubuntu/crm-backend/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
EnvironmentFile=/home/ubuntu/crm-backend/.env
ExecStart=/home/ubuntu/crm-backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2 --log-level info
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Save: `Ctrl+X` → `Y` → `Enter`

```bash
# Reload systemd and enable the service
sudo systemctl daemon-reload
sudo systemctl enable crm-backend
sudo systemctl start crm-backend

# Check status (should show "active (running)")
sudo systemctl status crm-backend

# Watch live logs
sudo journalctl -u crm-backend -f --no-pager
```

Press `Ctrl+C` to stop watching logs.

### Step 3.13 — Configure Nginx (Reverse Proxy)

Nginx sits in front of FastAPI. It handles HTTP→HTTPS redirects and forwards requests to your API.

```bash
# Remove the default Nginx config
sudo rm /etc/nginx/sites-enabled/default

# Create your config
sudo nano /etc/nginx/sites-available/crm-backend
```

Paste:
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    # For SSL certificate verification (Certbot will add HTTPS config below this)
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;

        # File upload limit (resumes, documents)
        client_max_body_size 20M;
    }
}
```

```bash
# Enable the config
sudo ln -s /etc/nginx/sites-available/crm-backend /etc/nginx/sites-enabled/

# Test for syntax errors
sudo nginx -t
# Should say: syntax is ok / test is successful

# Restart Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### Step 3.14 — Install SSL Certificate (Free HTTPS)

> You need a domain name pointing to your EC2 before this step.
> Skip to Part 4 (Domain Setup) first, then come back here.

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get your free SSL certificate (replace with your actual domain)
sudo certbot --nginx -d api.yourdomain.com

# Follow prompts:
# - Enter your email (for renewal notifications)
# - Agree to terms of service: A
# - Share email with EFF: N (optional)
# Certbot will automatically update your Nginx config for HTTPS

# Test auto-renewal
sudo certbot renew --dry-run
# Should say: Congratulations, all simulated renewals succeeded
```

Your API is now available at: `https://api.yourdomain.com`

---

## PART 4 — Frontend Deployment (S3 + CloudFront)

The React app is built locally and uploaded to AWS S3, then served globally via CloudFront CDN.

### Step 4.1 — Configure Frontend for Production

**On your LOCAL Windows machine:**

Open `d:\crm-project\frontend\.env.production` and verify:
```env
VITE_API_URL=/api/v1
VITE_RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxxxxxx
```

> `VITE_API_URL=/api/v1` works because CloudFront will route `/api/*` to your EC2 backend.
> If you're NOT using CloudFront to proxy API calls, use: `VITE_API_URL=https://api.yourdomain.com/api/v1`

### Step 4.2 — Build the React App

```powershell
# In PowerShell on your local machine
cd d:\crm-project\frontend

# Install dependencies (if not already done)
npm install

# Build for production
npm run build

# You will see: dist/ folder created with optimized files
# Check it was created:
dir dist
```

### Step 4.3 — Create S3 Bucket

1. AWS Console → Search **"S3"** → Click S3
2. Click **"Create bucket"**
3. Settings:
   - Bucket name: `crm-frontend-yourcompanyname` (must be globally unique — add your company name)
   - Region: `ap-south-1` (Mumbai)
   - **Object Ownership**: ACLs disabled (recommended)
   - **Block Public Access**: Uncheck **"Block all public access"** → check the acknowledgment box
4. Click **"Create bucket"**

**Enable Static Website Hosting:**
1. Click your bucket → **"Properties"** tab
2. Scroll to bottom → **"Static website hosting"** → **"Edit"**
3. Enable: ✓
4. Index document: `index.html`
5. Error document: `index.html` (important — React Router needs this)
6. Click **"Save changes"**

**Set Bucket Policy (allow public read):**
1. Click **"Permissions"** tab → **"Bucket policy"** → **"Edit"**
2. Paste (replace `crm-frontend-yourcompanyname` with your actual bucket name):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::crm-frontend-yourcompanyname/*"
    }
  ]
}
```
3. Click **"Save changes"**

### Step 4.4 — Upload Frontend Files

**On your LOCAL Windows machine:**

```powershell
# Upload the dist folder to S3
aws s3 sync d:\crm-project\frontend\dist s3://crm-frontend-yourcompanyname --delete

# You'll see each file being uploaded
# Example: upload: dist\index.html to s3://crm-frontend-yourcompanyname/index.html
```

### Step 4.5 — Create CloudFront Distribution (CDN + HTTPS)

CloudFront serves your frontend fast from 400+ locations worldwide and adds HTTPS.

1. AWS Console → Search **"CloudFront"** → Click CloudFront
2. Click **"Create Distribution"**

**Origin:**
- Origin domain: select your S3 bucket from dropdown (it will show `crm-frontend-yourcompanyname.s3.amazonaws.com`)
- Origin access: **"Legacy access identities"**
  - Click **"Create new OAI"** → **"Create"**
  - Select **"Yes, update the bucket policy"** (this auto-secures your S3)

**Default cache behavior:**
- Viewer protocol policy: **Redirect HTTP to HTTPS**
- Allowed HTTP methods: **GET, HEAD**
- Cache policy: **CachingOptimized** (from dropdown)

**Settings:**
- Alternate domain names (CNAMEs): `yourdomain.com` and `www.yourdomain.com`
  (Only fill this if you have a domain. Leave empty for now if not.)
- SSL certificate: 
  - If you have a domain: Click **"Request certificate"** → request for `yourdomain.com` and `*.yourdomain.com` → validate via DNS → come back and select it
  - If no domain yet: Leave as default CloudFront certificate
- Default root object: `index.html`

**Error pages (CRITICAL for React Router):**
After creating distribution:
1. Click your distribution → **"Error pages"** tab
2. **"Create custom error response"**:
   - HTTP error code: **403**
   - Response page path: `/index.html`
   - HTTP response code: **200**
3. Create another:
   - HTTP error code: **404**
   - Response page path: `/index.html`
   - HTTP response code: **200**

3. Click **"Create Distribution"**
4. Wait 5–15 minutes for deployment. Status changes from "Deploying" to "Enabled".
5. **Note your CloudFront domain** — looks like `d1abc123.cloudfront.net`

Test your frontend: open `https://d1abc123.cloudfront.net` in browser. Your CRM login page should appear.

---

## PART 5 — CloudFront API Routing (Connect Frontend to Backend)

You need CloudFront to route API calls from your frontend to your EC2 backend. This way everything uses one domain.

### Step 5.1 — Add Backend as CloudFront Origin

1. CloudFront → your distribution → **"Origins"** tab → **"Create origin"**
2. Settings:
   - Origin domain: `api.yourdomain.com` (your EC2 domain from Part 3)
   - Protocol: **HTTPS only**
   - Name: `crm-backend-origin`
3. Click **"Create origin"**

### Step 5.2 — Add Cache Behavior for /api/*

1. **"Behaviors"** tab → **"Create behavior"**
2. Settings:
   - Path pattern: `/api/*`
   - Origin: select `crm-backend-origin`
   - Viewer protocol policy: **Redirect HTTP to HTTPS**
   - Allowed HTTP methods: **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE**
   - Cache policy: **CachingDisabled** (API responses must not be cached!)
   - Origin request policy: **AllViewer** (passes all headers, cookies, query strings)
3. Click **"Create behavior"**

Now your frontend at `yourdomain.com` sends API calls to `/api/v1/...` which CloudFront routes to your EC2 backend. No CORS issues!

---

## PART 6 — Domain & DNS Setup

### Step 6.1 — Buy a Domain (if you don't have one)

Options:
- **AWS Route 53**: Search "Route 53" → "Register domains" → ~$12/year for .com
- **GoDaddy / Namecheap**: Similar price, then point to Route 53

### Step 6.2 — Create Route 53 Hosted Zone

1. AWS Console → **Route 53** → **"Hosted zones"** → **"Create hosted zone"**
2. Domain name: `yourdomain.com`
3. Type: **Public hosted zone**
4. Click **"Create hosted zone"**
5. Note the **4 NS (nameserver) records** — example:
   ```
   ns-123.awsdns-12.com
   ns-456.awsdns-34.net
   ns-789.awsdns-56.org
   ns-012.awsdns-78.co.uk
   ```

### Step 6.3 — Update Nameservers at Your Domain Registrar

1. Log in to wherever you bought the domain (GoDaddy, Namecheap, etc.)
2. Find DNS / Nameserver settings
3. Replace their nameservers with the 4 AWS nameservers from above
4. Save. **DNS propagation takes 5 minutes to 48 hours.**

### Step 6.4 — Create DNS Records

In Route 53 → your hosted zone → **"Create record"**:

**Frontend (root domain):**
- Record name: (empty — this is for yourdomain.com)
- Record type: **A**
- Alias: ✓ Yes
- Route traffic to: **CloudFront distribution** → select yours
- Click **"Create records"**

**Frontend (www):**
- Record name: `www`
- Record type: **A**
- Alias: ✓ Yes
- Route traffic to: **CloudFront distribution** → select yours
- Click **"Create records"**

**Backend API:**
- Record name: `api`
- Record type: **A**
- Alias: No
- Value: `13.233.45.67` (your EC2 Elastic IP)
- TTL: 300
- Click **"Create records"**

### Step 6.5 — Request SSL Certificate for Custom Domain

1. AWS Console → **ACM (Certificate Manager)** → Make sure you're in **us-east-1 (N. Virginia)** region!
   (CloudFront requires ACM certificates to be in us-east-1)
2. **"Request certificate"** → **"Request a public certificate"** → Next
3. Domain names:
   - `yourdomain.com`
   - `*.yourdomain.com` (covers www, api, and any subdomain)
4. Validation method: **DNS validation**
5. Click **"Request"**
6. Click the certificate → **"Create records in Route 53"** button
7. AWS will auto-add the validation records to Route 53
8. Wait 5–30 minutes for status to change to **"Issued"**
9. Go back to your CloudFront distribution → **"Edit"** → change SSL certificate to this new one

---

## PART 7 — Final Configuration

### Step 7.1 — Update Backend .env with Final Domain

SSH into EC2 and update the .env:
```bash
nano /home/ubuntu/crm-backend/.env
```

Update these lines:
```env
ALLOWED_ORIGINS=["https://yourdomain.com","https://www.yourdomain.com"]
FRONTEND_URL=https://yourdomain.com
```

Restart backend:
```bash
sudo systemctl restart crm-backend
```

### Step 7.2 — Update MongoDB Atlas IP Whitelist

Now that your EC2 has a permanent Elastic IP, restrict Atlas access to only that IP:

1. MongoDB Atlas → **"Network Access"** → Edit the `0.0.0.0/0` rule
2. Change to your EC2 Elastic IP: `13.233.45.67/32`
3. Click **"Confirm"**

### Step 7.3 — Restrict EC2 Security Group SSH Access

1. EC2 → **Security Groups** → `crm-sg`
2. **"Inbound rules"** → Edit → Find the SSH rule
3. Change Source from `0.0.0.0/0` to **"My IP"** (shows your current IP)
4. Also remove port 8000 rule (Nginx now handles routing, port 8000 should not be public)
5. Save rules

### Step 7.4 — End-to-End Test Checklist

```
 ✓ Open: https://yourdomain.com
   → Should show your React login page

 ✓ Open: https://yourdomain.com/api/v1/health (or https://api.yourdomain.com/health)
   → Should return: {"status": "healthy", ...}

 ✓ Open: https://api.yourdomain.com/docs
   → Should show FastAPI Swagger docs

 ✓ Try logging in with your admin credentials
   → Should login successfully

 ✓ Try uploading a resume
   → Should parse with Claude AI and fill the form

 ✓ Check HTTPS padlock in browser
   → Should be secure (green padlock)
```

---

## PART 8 — How to Update After Code Changes

Every time you fix a bug or add a feature, follow these steps.

### Update Backend

**On your LOCAL Windows machine:**

```powershell
# Step 1: Create zip of updated backend
cd d:\crm-project
Compress-Archive -Path backend -DestinationPath backend-update.zip -Force

# Step 2: Upload to server
scp -i "C:\Users\YourName\.ssh\crm-key.pem" backend-update.zip ubuntu@13.233.45.67:/home/ubuntu/
```

**SSH into server:**

```bash
ssh -i "C:\Users\YourName\.ssh\crm-key.pem" ubuntu@13.233.45.67
```

```bash
cd /home/ubuntu

# Extract new code to a temp location
unzip -o backend-update.zip -d backend-update-temp

# Backup current .env (IMPORTANT — never lose this!)
cp crm-backend/.env /home/ubuntu/.env.backup

# Replace old code with new code
rm -rf crm-backend-old 2>/dev/null
mv crm-backend crm-backend-old
mv backend-update-temp/backend crm-backend

# Restore the .env file (it's never in the zip)
cp /home/ubuntu/.env.backup crm-backend/.env

# Restore uploads directory link/permissions
ln -sfn /home/ubuntu/crm-backend-old/uploads crm-backend/uploads 2>/dev/null || true
mkdir -p crm-backend/uploads/resumes crm-backend/uploads/documents

# Install any new Python packages
cd crm-backend
source venv/bin/activate
pip install -r requirements.txt -q

# Restart the service
sudo systemctl restart crm-backend

# Watch logs to confirm startup
sudo journalctl -u crm-backend -f --no-pager
# Wait until you see "Application startup complete" then Ctrl+C

# Cleanup temp files
rm -rf /home/ubuntu/backend-update.zip /home/ubuntu/backend-update-temp
```

### Update Frontend

**On your LOCAL Windows machine:**

```powershell
# Step 1: Rebuild
cd d:\crm-project\frontend
npm run build

# Step 2: Upload to S3
aws s3 sync dist s3://crm-frontend-yourcompanyname --delete

# Step 3: Invalidate CloudFront cache so users get the new version immediately
# (Replace YOUR_DIST_ID with your actual CloudFront distribution ID)
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

> Find your CloudFront Distribution ID: AWS Console → CloudFront → your distribution → copy the ID (e.g., `E1ABC2DEF3GHI4`)

### Quick Deploy Script (Save as `d:\crm-project\deploy.bat`)

Create this file for one-click deployment:

```batch
@echo off
setlocal

:: ── Configuration (update these once) ──────────────────────────────────────
set EC2_IP=13.233.45.67
set KEY_FILE=C:\Users\YourName\.ssh\crm-key.pem
set S3_BUCKET=crm-frontend-yourcompanyname
set CF_DIST_ID=YOUR_CLOUDFRONT_DISTRIBUTION_ID

echo.
echo ============================================
echo   Niyan HireFlow — Deploying...
echo ============================================
echo.

:: ── Frontend ────────────────────────────────────────────────────────────────
echo [1/4] Building React frontend...
cd d:\crm-project\frontend
call npm run build
if %ERRORLEVEL% neq 0 ( echo BUILD FAILED & pause & exit /b 1 )

echo [2/4] Uploading to S3...
aws s3 sync dist s3://%S3_BUCKET% --delete --quiet
aws cloudfront create-invalidation --distribution-id %CF_DIST_ID% --paths "/*" --output text

:: ── Backend ──────────────────────────────────────────────────────────────────
echo [3/4] Packaging backend...
cd d:\crm-project
Compress-Archive -Force -Path backend -DestinationPath backend-deploy.zip

echo [4/4] Deploying backend to EC2...
scp -i "%KEY_FILE%" -q backend-deploy.zip ubuntu@%EC2_IP%:/home/ubuntu/

ssh -i "%KEY_FILE%" ubuntu@%EC2_IP% "^
  cd /home/ubuntu && ^
  unzip -o backend-deploy.zip -d backend-deploy-temp && ^
  cp crm-backend/.env /home/ubuntu/.env.backup && ^
  rm -rf crm-backend-old && mv crm-backend crm-backend-old && ^
  mv backend-deploy-temp/backend crm-backend && ^
  cp /home/ubuntu/.env.backup crm-backend/.env && ^
  mkdir -p crm-backend/uploads/resumes crm-backend/uploads/documents && ^
  cd crm-backend && source venv/bin/activate && pip install -r requirements.txt -q && ^
  sudo systemctl restart crm-backend && ^
  sleep 3 && sudo systemctl status crm-backend --no-pager && ^
  rm -rf /home/ubuntu/backend-deploy.zip /home/ubuntu/backend-deploy-temp ^
"

echo.
echo ============================================
echo   Deployment Complete!
echo   Frontend: https://yourdomain.com
echo   Backend:  https://api.yourdomain.com/health
echo ============================================
del backend-deploy.zip 2>nul
```

---

## PART 9 — Monitoring & Logs

### View Backend Logs (Most Important)

```bash
# Live log stream
sudo journalctl -u crm-backend -f --no-pager

# Last 100 lines
sudo journalctl -u crm-backend -n 100 --no-pager

# Logs since a specific time
sudo journalctl -u crm-backend --since "2024-01-15 10:00:00" --no-pager
```

### View Nginx Logs

```bash
# Access log (all requests)
sudo tail -f /var/log/nginx/access.log

# Error log (4xx/5xx errors)
sudo tail -f /var/log/nginx/error.log
```

### Check Service Status

```bash
# Backend API
sudo systemctl status crm-backend

# Nginx
sudo systemctl status nginx

# Docker (Redis)
docker ps
docker logs crm_redis --tail 50
```

### Check Server Resources

```bash
# CPU and RAM usage
htop
# Press Q to exit

# Disk usage
df -h

# Memory
free -h
```

### Test API Health

From anywhere in the world:
```bash
curl https://api.yourdomain.com/health
# Expected: {"status": "healthy", "mongodb": "connected", "redis": "connected"}
```

---

## PART 10 — Security Checklist

Before going live with real user data, verify all of these:

**Server Security:**
- [ ] EC2 Security Group: SSH port 22 allows only YOUR IP (not 0.0.0.0/0)
- [ ] EC2 Security Group: Port 8000 is NOT open publicly (only port 80 and 443)
- [ ] `.env` file on server has correct permissions: `chmod 600 /home/ubuntu/crm-backend/.env`

**Secrets:**
- [ ] `JWT_SECRET_KEY` is at least 64 random characters
- [ ] `FERNET_SECRET_KEY` is a valid Fernet key (generated, not guessed)
- [ ] MongoDB Atlas has a strong password
- [ ] Redis has a strong password
- [ ] `.env` file is in `.gitignore` (never committed to Git)

**Network Security:**
- [ ] MongoDB Atlas Network Access: only your EC2 Elastic IP is whitelisted (not 0.0.0.0/0)
- [ ] HTTPS is working on both frontend (CloudFront) and backend (Certbot)
- [ ] `DEBUG=false` in production .env

**Application:**
- [ ] `ALLOWED_ORIGINS` contains only your actual domains (not localhost)
- [ ] Razorpay using LIVE keys (not test keys)
- [ ] Email: using a proper SMTP service, not personal email

**Backups:**
- [ ] MongoDB Atlas M10 tier: automatic daily backups are ON by default
- [ ] `.env` file backed up securely (outside the server — in a password manager or secure notes)

---

## PART 11 — Troubleshooting

### Problem: Backend won't start

```bash
# Check detailed error
sudo journalctl -u crm-backend -n 50 --no-pager

# Common fix 1: .env has wrong MongoDB URI
# Test MongoDB connection:
cd /home/ubuntu/crm-backend && source venv/bin/activate
python3 -c "
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
async def test():
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    info = await client.server_info()
    print('MongoDB OK:', info['version'])
asyncio.run(test())
"

# Common fix 2: Redis not running
docker ps | grep redis
# If not showing, restart it:
docker start crm_redis
```

### Problem: 502 Bad Gateway

```bash
# Nginx can't reach the backend — backend isn't running
sudo systemctl status crm-backend
sudo systemctl restart crm-backend
```

### Problem: CORS Error in Browser Console

```bash
# Check ALLOWED_ORIGINS in .env includes your frontend domain
# Example error: "Access to XMLHttpRequest blocked by CORS policy"
nano /home/ubuntu/crm-backend/.env
# Fix ALLOWED_ORIGINS, then:
sudo systemctl restart crm-backend
```

### Problem: React app shows blank white page

1. Check browser Console (F12) for errors
2. If "404" on JS files: CloudFront error pages not configured → add 403→index.html and 404→index.html custom error responses
3. If API calls fail: check `VITE_API_URL` in frontend `.env.production`, rebuild and re-upload

### Problem: MongoDB "Authentication failed"

- Check your Atlas password has no special characters that need URL-encoding
- Characters like `@`, `#`, `%`, `?` need encoding: `@` → `%40`, `#` → `%23`
- Or regenerate a password with only alphanumeric characters

### Problem: File upload fails (resumes)

```bash
# Check uploads directory exists and has permissions
ls -la /home/ubuntu/crm-backend/uploads/
# Should show resumes/ and documents/ directories
# Fix if needed:
mkdir -p /home/ubuntu/crm-backend/uploads/resumes /home/ubuntu/crm-backend/uploads/documents
chmod -R 755 /home/ubuntu/crm-backend/uploads/
```

### Problem: SSL Certificate not renewing

```bash
# Certbot auto-renews via a cron job. Check it:
sudo certbot renew --dry-run

# If it fails, check Nginx is running:
sudo systemctl status nginx
```

### Problem: SSH "Permission denied (publickey)"

```powershell
# Your IP may have changed. Update the EC2 Security Group:
# 1. Find your current IP: visit https://whatismyip.com
# 2. AWS Console → EC2 → Security Groups → crm-sg → Edit inbound rules
# 3. Update SSH source to your new IP
```

---

## PART 12 — Day-1 Launch Checklist

Print this and check off each item:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  INFRASTRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 □ MongoDB Atlas cluster created + user + IP whitelist
 □ AWS Account created + IAM user + AWS CLI configured
 □ EC2 t3.small launched (Ubuntu 22.04)
 □ Elastic IP allocated + associated to EC2
 □ EC2 Security Group: SSH(22 my IP), HTTP(80), HTTPS(443)
 □ Docker installed on EC2
 □ Redis container running on EC2
 □ Python 3.12 + Nginx installed on EC2

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BACKEND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 □ Backend code uploaded to /home/ubuntu/crm-backend
 □ Python venv created + requirements.txt installed
 □ .env file created with ALL values filled
 □ uploads/ directories created
 □ Manual test: uvicorn runs without errors
 □ Systemd service created + enabled + running
 □ Nginx config created + enabled
 □ SSL certificate (Certbot) installed for api.yourdomain.com

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FRONTEND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 □ .env.production has correct VITE_API_URL
 □ npm run build succeeded
 □ S3 bucket created + public access + website hosting
 □ Files uploaded to S3 via aws s3 sync
 □ CloudFront distribution created
 □ CloudFront custom error pages: 403→index.html, 404→index.html
 □ CloudFront behavior for /api/* pointing to EC2 backend

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DOMAIN & SSL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 □ Domain purchased
 □ Route 53 hosted zone created
 □ Domain nameservers updated to Route 53 NS records
 □ DNS records: yourdomain.com → CloudFront
 □ DNS records: www.yourdomain.com → CloudFront
 □ DNS records: api.yourdomain.com → EC2 Elastic IP
 □ ACM certificate (us-east-1) issued for yourdomain.com + *.yourdomain.com
 □ CloudFront using ACM certificate
 □ Certbot SSL for api.yourdomain.com

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FINAL TESTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 □ https://yourdomain.com loads login page
 □ https://api.yourdomain.com/health returns healthy
 □ Login works
 □ Create a test user
 □ Upload a resume
 □ MongoDB Atlas → check data appeared in master_db
 □ Email sending works (test via password reset)
 □ HTTPS padlock is green on both frontend and API

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SECURITY LOCKDOWN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 □ MongoDB Atlas IP whitelist: only EC2 Elastic IP
 □ EC2 Security Group: remove port 8000 from public
 □ chmod 600 /home/ubuntu/crm-backend/.env
 □ DEBUG=false in .env
 □ .env backed up securely
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## APPENDIX — Useful Commands Reference

### Server Management (run via SSH)

```bash
# Backend service
sudo systemctl start crm-backend      # Start
sudo systemctl stop crm-backend       # Stop
sudo systemctl restart crm-backend    # Restart (after code update or .env change)
sudo systemctl status crm-backend     # Check status

# Nginx
sudo systemctl restart nginx
sudo nginx -t                          # Test config for syntax errors

# Redis (Docker)
docker start crm_redis
docker stop crm_redis
docker restart crm_redis
docker logs crm_redis --tail 100

# Disk usage
df -h
du -sh /home/ubuntu/crm-backend/uploads    # Check upload folder size
```

### Generate Secrets (run on your LOCAL machine)

```powershell
# JWT Secret Key (64-char hex)
python -c "import secrets; print(secrets.token_hex(64))"

# Fernet Key (for tenant SMTP encryption)
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### AWS CLI Shortcuts

```powershell
# Upload frontend to S3
aws s3 sync d:\crm-project\frontend\dist s3://crm-frontend-yourcompanyname --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"

# Check EC2 instance status
aws ec2 describe-instances --region ap-south-1 --query "Reservations[*].Instances[*].{ID:InstanceId,State:State.Name,IP:PublicIpAddress}" --output table
```
