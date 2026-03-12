#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Create ECR Repository in AWS
# Run this ONCE from your LOCAL machine (with AWS CLI configured)
#
# Usage: bash scripts/create-ecr.sh
# ─────────────────────────────────────────────────────────────────────────────

AWS_REGION="ap-south-1"
REPO_NAME="crm-backend"

echo "Creating ECR repository: $REPO_NAME in $AWS_REGION..."

aws ecr create-repository \
  --repository-name $REPO_NAME \
  --region $AWS_REGION \
  --image-scanning-configuration scanOnPush=true \
  --image-tag-mutability MUTABLE

ECR_URI=$(aws ecr describe-repositories \
  --repository-names $REPO_NAME \
  --region $AWS_REGION \
  --query 'repositories[0].repositoryUri' \
  --output text)

echo ""
echo "✅ ECR Repository created!"
echo ""
echo "Repository URI: $ECR_URI"
echo ""
echo "Add this to GitHub Secrets:"
echo "  ECR_REPOSITORY = $REPO_NAME"
echo ""
echo "Your Account ID: $(aws sts get-caller-identity --query Account --output text)"
