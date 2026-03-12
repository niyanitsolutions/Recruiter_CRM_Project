################################################################################
# outputs.tf — Terraform output values
# Run `terraform output` after apply to get the connection strings and URLs.
################################################################################

# ── Networking ────────────────────────────────────────────────────────────────

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs (ALB lives here)"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet IDs (ECS + Redis live here)"
  value       = aws_subnet.private[*].id
}

# ── ALB ───────────────────────────────────────────────────────────────────────

output "alb_dns_name" {
  description = "ALB DNS name — point your domain CNAME here (or add an Alias record)"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "ALB hosted zone ID — needed for Route 53 Alias records"
  value       = aws_lb.main.zone_id
}

output "alb_arn" {
  description = "ALB ARN"
  value       = aws_lb.main.arn
}

# ── ACM Certificate ───────────────────────────────────────────────────────────

output "acm_certificate_arn" {
  description = "ACM certificate ARN (used by the HTTPS listener)"
  value       = aws_acm_certificate.main.arn
}

# ── ECR ───────────────────────────────────────────────────────────────────────

output "ecr_repository_url" {
  description = "ECR repository URL — use this in docker push and as ECS image URI"
  value       = aws_ecr_repository.backend.repository_url
}

output "ecr_repository_name" {
  description = "ECR repository name"
  value       = aws_ecr_repository.backend.name
}

# ── ECS ───────────────────────────────────────────────────────────────────────

output "ecs_cluster_name" {
  description = "ECS cluster name — needed by GitHub Actions deploy step"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name — needed by GitHub Actions deploy step"
  value       = aws_ecs_service.backend.name
}

output "ecs_task_definition_family" {
  description = "ECS task definition family name"
  value       = aws_ecs_task_definition.backend.family
}

output "ecs_task_execution_role_arn" {
  description = "ECS Task Execution IAM role ARN"
  value       = aws_iam_role.ecs_task_execution.arn
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group for ECS container logs"
  value       = aws_cloudwatch_log_group.backend.name
}

# ── Redis / ElastiCache ───────────────────────────────────────────────────────

output "redis_endpoint" {
  description = "Redis (ElastiCache) endpoint — use as REDIS_URL in Secrets Manager"
  value       = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379/0"
}

output "redis_host" {
  description = "Redis host only (without scheme/port)"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

# ── Auto Scaling ──────────────────────────────────────────────────────────────

output "autoscaling_min_tasks" {
  description = "Minimum ECS task count"
  value       = var.ecs_min_tasks
}

output "autoscaling_max_tasks" {
  description = "Maximum ECS task count"
  value       = var.ecs_max_tasks
}

# ── Useful commands (printed after terraform apply) ───────────────────────────

output "next_steps" {
  description = "Quick-reference commands after first apply"
  value       = <<-EOT
    ── After first apply ──────────────────────────────────────────────────────
    1. Create DNS record:
       CNAME  api.${var.domain_name}  →  ${aws_lb.main.dns_name}

    2. Validate ACM certificate (check AWS Console → Certificate Manager)
       DNS validation record will be shown in the console.

    3. Push your Docker image:
       aws ecr get-login-password --region ${var.aws_region} | \
         docker login --username AWS --password-stdin ${aws_ecr_repository.backend.repository_url}
       docker build -t ${aws_ecr_repository.backend.repository_url}:latest ./backend
       docker push ${aws_ecr_repository.backend.repository_url}:latest

    4. Force a new ECS deployment:
       aws ecs update-service \
         --cluster ${aws_ecs_cluster.main.name} \
         --service ${aws_ecs_service.backend.name} \
         --force-new-deployment

    5. Tail logs:
       aws logs tail ${aws_cloudwatch_log_group.backend.name} --follow
    ───────────────────────────────────────────────────────────────────────────
  EOT
}
