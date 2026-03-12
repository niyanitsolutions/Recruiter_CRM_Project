# ─────────────────────────────────────────────────────────────────────────────
# Makefile — CRM Platform shortcuts
# Usage: make <target>
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: help up down build logs shell-backend shell-frontend test lint \
        deploy-backend deploy-frontend redis-cli mongo-shell clean

# Default target
help:
	@echo ""
	@echo "CRM Platform — Available Commands"
	@echo "────────────────────────────────────────"
	@echo "  make up              Start all services (local dev)"
	@echo "  make down            Stop all services"
	@echo "  make build           Rebuild all Docker images"
	@echo "  make logs            Stream all service logs"
	@echo "  make logs-backend    Stream backend logs only"
	@echo ""
	@echo "  make test            Run backend tests"
	@echo "  make lint            Run flake8 + black check"
	@echo ""
	@echo "  make redis-cli       Open Redis CLI"
	@echo "  make mongo-shell     Open MongoDB shell"
	@echo "  make shell-backend   Open bash in backend container"
	@echo ""
	@echo "  make deploy-backend  Build + push backend image to ECR"
	@echo "  make deploy-frontend Build + upload frontend to S3"
	@echo "  make clean           Remove all containers, volumes, images"
	@echo ""

# ─── Local Development ────────────────────────────────────────────────────────

up:
	docker-compose up --build

up-detach:
	docker-compose up -d --build

down:
	docker-compose down

build:
	docker-compose build --no-cache

logs:
	docker-compose logs -f

logs-backend:
	docker-compose logs -f backend

logs-redis:
	docker-compose logs -f redis

# ─── Shell Access ─────────────────────────────────────────────────────────────

shell-backend:
	docker-compose exec backend bash

shell-frontend:
	docker-compose exec frontend sh

redis-cli:
	docker-compose exec redis redis-cli

mongo-shell:
	docker-compose exec mongodb mongosh -u admin -p admin123

# ─── Testing & Linting ────────────────────────────────────────────────────────

test:
	docker-compose exec backend python -m pytest tests/ -v --tb=short

test-local:
	cd backend && python -m pytest tests/ -v --tb=short

lint:
	cd backend && python -m flake8 app/ --max-line-length=120 --exclude=__pycache__
	cd backend && python -m black app/ --check --line-length=120

format:
	cd backend && python -m black app/ --line-length=120
	cd backend && python -m isort app/

# ─── Frontend ─────────────────────────────────────────────────────────────────

frontend-build:
	cd frontend && npm run build

frontend-install:
	cd frontend && npm install

# ─── Production Deployment ────────────────────────────────────────────────────

# Requires: AWS_ACCOUNT_ID, AWS_REGION, ECR_REPOSITORY env vars
deploy-backend:
	@echo "Building and pushing backend Docker image to ECR..."
	aws ecr get-login-password --region $(AWS_REGION) | \
		docker login --username AWS --password-stdin $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com
	docker build -t $(ECR_REPOSITORY) ./backend
	docker tag $(ECR_REPOSITORY):latest $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/$(ECR_REPOSITORY):latest
	docker push $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/$(ECR_REPOSITORY):latest
	@echo "✅ Backend image pushed"

# Requires: S3_BUCKET, CLOUDFRONT_DISTRIBUTION_ID env vars
deploy-frontend:
	@echo "Building React app..."
	cd frontend && npm ci && npm run build
	@echo "Uploading to S3..."
	aws s3 sync frontend/dist/ s3://$(S3_BUCKET) --delete
	@echo "Invalidating CloudFront cache..."
	aws cloudfront create-invalidation \
		--distribution-id $(CLOUDFRONT_DISTRIBUTION_ID) \
		--paths "/*"
	@echo "✅ Frontend deployed"

# ─── Cleanup ──────────────────────────────────────────────────────────────────

clean:
	docker-compose down -v --remove-orphans
	docker system prune -f

clean-all:
	docker-compose down -v --remove-orphans
	docker system prune -af --volumes
