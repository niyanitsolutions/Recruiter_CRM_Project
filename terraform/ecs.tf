################################################################################
# ecs.tf — ECS Cluster, IAM Roles, Task Definition, Fargate Service
################################################################################

# ── ECS Cluster ───────────────────────────────────────────────────────────────

resource "aws_ecs_cluster" "main" {
  name = "${var.project}-cluster-${var.env}"

  setting {
    name  = "containerInsights"
    value = "enabled"   # CloudWatch Container Insights for metrics/logs
  }

  tags = { Name = "${var.project}-cluster-${var.env}" }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1   # Always keep at least 1 task on regular Fargate
  }
}

# ── CloudWatch Log Group ──────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${var.project}-backend-${var.env}"
  retention_in_days = 30

  tags = { Name = "${var.project}-logs-${var.env}" }
}

# ── IAM: Task Execution Role ──────────────────────────────────────────────────
# Used by ECS to:
#   - Pull the Docker image from ECR
#   - Write logs to CloudWatch
#   - Read secrets from Secrets Manager

resource "aws_iam_role" "ecs_task_execution" {
  name = "${var.project}-ecs-exec-role-${var.env}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${var.project}-ecs-exec-role-${var.env}" }
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_managed" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Allow reading secrets from Secrets Manager
resource "aws_iam_role_policy" "ecs_secrets" {
  name = "${var.project}-ecs-secrets-${var.env}"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [var.app_secrets_arn]
    }]
  })
}

# ── IAM: Task Role ────────────────────────────────────────────────────────────
# Used by the APPLICATION running inside the container (e.g., to write to S3)

resource "aws_iam_role" "ecs_task" {
  name = "${var.project}-ecs-task-role-${var.env}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${var.project}-ecs-task-role-${var.env}" }
}

# Allow application to write files to S3 (for uploads/exports)
resource "aws_iam_role_policy" "ecs_task_s3" {
  name = "${var.project}-ecs-s3-${var.env}"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
      Resource = ["arn:aws:s3:::${var.project}-uploads-${var.env}/*"]
    }]
  })
}

# ── ECS Task Definition ───────────────────────────────────────────────────────
# Defines the container spec — CPU, memory, image, env vars, logging

resource "aws_ecs_task_definition" "backend" {
  family                   = "${var.project}-backend-${var.env}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "backend"
      # Image is overridden at deploy time by the CI/CD pipeline.
      # This placeholder ensures the task definition is valid on first apply.
      image     = "${aws_ecr_repository.backend.repository_url}:latest"
      essential = true

      portMappings = [
        {
          containerPort = 8000
          protocol      = "tcp"
        }
      ]

      # ── Secrets from AWS Secrets Manager ─────────────────────────────────
      # All sensitive env vars are stored in one Secrets Manager secret (JSON).
      # Keys in the secret must match these names exactly.
      secrets = [
        { name = "MONGODB_URI",                    valueFrom = "${var.app_secrets_arn}:MONGODB_URI::" },
        { name = "MASTER_DB_NAME",                 valueFrom = "${var.app_secrets_arn}:MASTER_DB_NAME::" },
        { name = "JWT_SECRET_KEY",                 valueFrom = "${var.app_secrets_arn}:JWT_SECRET_KEY::" },
        { name = "RAZORPAY_KEY_ID",                valueFrom = "${var.app_secrets_arn}:RAZORPAY_KEY_ID::" },
        { name = "RAZORPAY_KEY_SECRET",            valueFrom = "${var.app_secrets_arn}:RAZORPAY_KEY_SECRET::" },
        { name = "REDIS_URL",                      valueFrom = "${var.app_secrets_arn}:REDIS_URL::" },
        { name = "SMTP_USER",                      valueFrom = "${var.app_secrets_arn}:SMTP_USER::" },
        { name = "SMTP_PASSWORD",                  valueFrom = "${var.app_secrets_arn}:SMTP_PASSWORD::" },
      ]

      # ── Non-sensitive environment variables ───────────────────────────────
      environment = [
        { name = "ENVIRONMENT",                       value = var.env },
        { name = "JWT_ALGORITHM",                     value = "HS256" },
        { name = "JWT_ACCESS_TOKEN_EXPIRE_MINUTES",   value = "60" },
        { name = "JWT_REFRESH_TOKEN_EXPIRE_DAYS",     value = "7" },
        { name = "ALLOWED_ORIGINS",                   value = "[\"https://${var.domain_name}\",\"https://www.${var.domain_name}\"]" },
        { name = "UPLOAD_DIR",                        value = "/tmp/uploads" },
        { name = "TRIAL_DAYS",                        value = "14" },
      ]

      # ── Health Check ──────────────────────────────────────────────────────
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"]
        interval    = 30
        timeout     = 10
        retries     = 3
        startPeriod = 30
      }

      # ── CloudWatch Logging ────────────────────────────────────────────────
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.backend.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "backend"
        }
      }

      # Prevent OOM — give the app 80% of task memory, leave 20% for OS
      memoryReservation = floor(var.task_memory * 0.8)
    }
  ])

  tags = { Name = "${var.project}-task-def-${var.env}" }

  lifecycle {
    # CI/CD updates the task definition on every deploy — ignore Terraform drift
    ignore_changes = [container_definitions]
  }
}

# ── ECS Fargate Service ───────────────────────────────────────────────────────

resource "aws_ecs_service" "backend" {
  name                               = "${var.project}-backend-${var.env}"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.backend.arn
  desired_count                      = var.ecs_min_tasks
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  health_check_grace_period_seconds  = 60
  force_new_deployment               = true   # re-pull image even if tag unchanged

  network_configuration {
    subnets          = aws_subnet.private[*].id   # ECS runs in private subnets
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false                      # private = no public IP needed
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 8000
  }

  deployment_controller {
    type = "ECS"   # Rolling deployment (0 downtime with min 2 tasks)
  }

  deployment_circuit_breaker {
    enable   = true    # Auto-rollback if the new tasks fail health checks
    rollback = true
  }

  # Allow the Auto Scaling policy to change desired_count without Terraform conflict
  lifecycle {
    ignore_changes = [desired_count]
  }

  depends_on = [
    aws_lb_listener.https,
    aws_iam_role_policy_attachment.ecs_task_execution_managed,
  ]

  tags = { Name = "${var.project}-service-${var.env}" }
}
