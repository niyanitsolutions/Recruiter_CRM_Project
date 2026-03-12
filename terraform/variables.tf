################################################################################
# variables.tf — All input variables
# Copy terraform.tfvars.example → terraform.tfvars and fill in your values
################################################################################

variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "ap-south-1"
}

variable "project" {
  description = "Project name prefix used for all resource names"
  type        = string
  default     = "crm"
}

variable "env" {
  description = "Environment name (prod / staging)"
  type        = string
  default     = "prod"
}

# ── Networking ─────────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (ALB)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (ECS, Redis)"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.11.0/24"]
}

# ── Domain & SSL ───────────────────────────────────────────────────────────────

variable "domain_name" {
  description = "Your root domain (e.g. yourdomain.com)"
  type        = string
}

variable "api_subdomain" {
  description = "Subdomain for the backend API"
  type        = string
  default     = "api"
}

# ── ECR / Docker ───────────────────────────────────────────────────────────────

variable "ecr_repository_name" {
  description = "ECR repository name for the backend Docker image"
  type        = string
  default     = "crm-backend"
}

# ── ECS Task Resources ─────────────────────────────────────────────────────────

variable "task_cpu" {
  description = "vCPU units for each ECS task (256=0.25, 512=0.5, 1024=1)"
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "Memory (MB) for each ECS task"
  type        = number
  default     = 1024
}

# ── ECS Auto Scaling ───────────────────────────────────────────────────────────

variable "ecs_min_tasks" {
  description = "Minimum number of ECS tasks (set to 2 for high-availability)"
  type        = number
  default     = 1   # Use 1 to save cost; 2 for zero-downtime deployments
}

variable "ecs_max_tasks" {
  description = "Maximum number of ECS tasks to scale up to"
  type        = number
  default     = 6
}

variable "autoscaling_cpu_target" {
  description = "Target CPU utilisation (%) to trigger scaling"
  type        = number
  default     = 70
}

# ── Redis (ElastiCache) ────────────────────────────────────────────────────────

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"   # ~$12/month — cheapest option
}

# ── App Secrets (stored in AWS Secrets Manager — never in .tfvars) ────────────
# These are referenced by ARN in the ECS task definition.
# Create them manually ONCE:
#   aws secretsmanager create-secret --name crm/prod/app \
#     --secret-string '{"MONGODB_URI":"...","JWT_SECRET_KEY":"...","REDIS_URL":"...",...}'

variable "app_secrets_arn" {
  description = "ARN of the AWS Secrets Manager secret holding all app env vars"
  type        = string
  # Example: arn:aws:secretsmanager:ap-south-1:123456789:secret:crm/prod/app-AbCdEf
}
