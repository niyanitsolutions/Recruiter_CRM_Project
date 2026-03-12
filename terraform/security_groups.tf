################################################################################
# security_groups.tf — Firewall rules for each layer
#
# Traffic flow:
#   Internet → ALB (80/443) → ECS tasks (8000) → Redis (6379)
################################################################################

# ── ALB Security Group ────────────────────────────────────────────────────────
# Accepts HTTP and HTTPS from the public internet

resource "aws_security_group" "alb" {
  name        = "${var.project}-alb-sg-${var.env}"
  description = "Allow HTTP and HTTPS from internet to ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP from internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-alb-sg-${var.env}" }
}

# ── ECS Tasks Security Group ──────────────────────────────────────────────────
# Accepts traffic ONLY from the ALB (port 8000)

resource "aws_security_group" "ecs" {
  name        = "${var.project}-ecs-sg-${var.env}"
  description = "Allow traffic from ALB to ECS tasks on port 8000"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "FastAPI from ALB"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "All outbound (ECR pull, MongoDB Atlas, Secrets Manager)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-ecs-sg-${var.env}" }
}

# ── Redis (ElastiCache) Security Group ────────────────────────────────────────
# Accepts traffic ONLY from ECS tasks (port 6379)

resource "aws_security_group" "redis" {
  name        = "${var.project}-redis-sg-${var.env}"
  description = "Allow Redis access only from ECS tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Redis from ECS tasks"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-redis-sg-${var.env}" }
}
