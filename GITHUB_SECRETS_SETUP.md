# GitHub Secrets & Repository Setup Guide

This guide explains how to set up GitHub repository secrets required for the CI/CD pipelines.

---

## Step 1: Push Project to GitHub

```bash
# In d:\crm-project on your local machine:
git init
git add .
git commit -m "Initial commit"

# Create a new repository on github.com (don't add README)
git remote add origin https://github.com/YOUR_USERNAME/crm-platform.git
git branch -M main
git push -u origin main
```

---

## Step 2: Add GitHub Secrets

Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add each secret below:

### AWS Secrets
| Secret Name | Value | Where to get it |
|-------------|-------|----------------|
| `AWS_ACCESS_KEY_ID` | `AKIA...` | IAM user → Security credentials → Create access key |
| `AWS_SECRET_ACCESS_KEY` | `xxxxx` | Same as above (shown once) |

### EC2 Secrets
| Secret Name | Value | Where to get it |
|-------------|-------|----------------|
| `EC2_HOST` | `13.233.xx.xx` | Your EC2 Elastic IP address |
| `EC2_USER` | `ubuntu` | Default Ubuntu user |
| `EC2_SSH_KEY` | (full private key) | Contents of `crm-key.pem` file |

**How to get EC2_SSH_KEY value:**
```bash
# On Windows PowerShell — print the .pem file contents:
Get-Content crm-key.pem

# Copy everything including:
# -----BEGIN RSA PRIVATE KEY-----
# ... (all lines) ...
# -----END RSA PRIVATE KEY-----
```

### Redis Secrets
| Secret Name | Value | Where to get it |
|-------------|-------|----------------|
| `REDIS_PASSWORD` | `strong-random-password` | Generate: `openssl rand -hex 32` |

### Frontend Secrets
| Secret Name | Value | Where to get it |
|-------------|-------|----------------|
| `S3_BUCKET` | `crm-frontend-yourdomain` | Your S3 bucket name |
| `CLOUDFRONT_DISTRIBUTION_ID` | `E1ABCDEF123` | CloudFront → your distribution |
| `VITE_API_URL` | `https://api.yourdomain.com/api/v1` | Your backend API URL |
| `VITE_RAZORPAY_KEY_ID` | `rzp_live_xxx` | Razorpay dashboard → live key |

---

## Step 3: Create ECR Repository (for backend Docker images)

```bash
# Run from your local machine (needs AWS CLI configured):
bash scripts/create-ecr.sh
```

This creates: `123456789.dkr.ecr.ap-south-1.amazonaws.com/crm-backend`

---

## Step 4: Setup EC2 (first time only)

```bash
# Upload setup script to EC2:
scp -i crm-key.pem scripts/ec2-setup.sh ubuntu@YOUR_EC2_IP:/home/ubuntu/

# SSH into EC2 and run it:
ssh -i crm-key.pem ubuntu@YOUR_EC2_IP
chmod +x ec2-setup.sh
./ec2-setup.sh

# After script completes:
# 1. Edit .env: nano /home/ubuntu/crm-backend/.env
# 2. Configure AWS: aws configure
# 3. Setup Nginx (see AWS_DEPLOYMENT_GUIDE.md)
```

---

## Step 5: Trigger First Deployment

```bash
# Make any small change and push:
git add .
git commit -m "Setup CI/CD"
git push origin main
```

Go to GitHub → **Actions** tab to watch the deployment run.

---

## How CI/CD Works After Setup

```
You push code to main branch
          │
          ├── backend/ changed? ──► deploy-backend.yml runs:
          │                          1. Run pytest tests
          │                          2. Build Docker image
          │                          3. Push to ECR
          │                          4. SSH to EC2 → pull image → restart container
          │
          └── frontend/ changed? ─► deploy-frontend.yml runs:
                                     1. npm ci + npm run build
                                     2. aws s3 sync → S3 bucket
                                     3. CloudFront cache invalidation
```

**Result:** Every `git push` to `main` = automatic deployment in ~3 minutes.

---

## Manual Deployment (if GitHub Actions fails)

### Backend
```bash
# SSH into EC2:
ssh -i crm-key.pem ubuntu@YOUR_EC2_IP

# Pull latest image and restart:
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.ap-south-1.amazonaws.com
docker pull YOUR_ECR_IMAGE:latest
docker stop crm_backend && docker rm crm_backend
docker run -d --name crm_backend --restart always -p 8000:8000 \
  --env-file /home/ubuntu/crm-backend/.env \
  -v uploads_data:/app/uploads \
  YOUR_ECR_IMAGE:latest
```

### Frontend
```bash
# On local machine:
cd frontend
npm run build
aws s3 sync dist/ s3://YOUR_S3_BUCKET --delete
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```
