################################################################################
# ecr.tf — Elastic Container Registry
# Stores backend Docker images — CI/CD pushes here, ECS pulls from here
################################################################################

resource "aws_ecr_repository" "backend" {
  name                 = var.ecr_repository_name
  image_tag_mutability = "MUTABLE"   # allows "latest" tag to be overwritten

  image_scanning_configuration {
    scan_on_push = true   # free vulnerability scan on every push
  }

  tags = { Name = "${var.project}-ecr-${var.env}" }
}

# ── Lifecycle Policy ──────────────────────────────────────────────────────────
# Keep only the last 10 tagged images and delete untagged images after 1 day
# Prevents the ECR storage bill from growing indefinitely

resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Remove untagged images after 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep last 10 tagged images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v", "sha-"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = { type = "expire" }
      }
    ]
  })
}
