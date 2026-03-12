################################################################################
# alb.tf — Application Load Balancer + HTTPS + ACM Certificate
#
# Traffic flow:
#   api.yourdomain.com → ALB → ECS target group (port 8000)
################################################################################

# ── ACM SSL Certificate ───────────────────────────────────────────────────────
# Requests a free SSL cert from AWS. You must verify domain ownership via DNS.
# After apply, go to ACM console and add the CNAME record shown to your DNS.

resource "aws_acm_certificate" "api" {
  domain_name               = "${var.api_subdomain}.${var.domain_name}"
  subject_alternative_names = ["${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = { Name = "${var.project}-cert-${var.env}" }
}

# Wait for certificate validation to complete before ALB uses it
resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for record in aws_acm_certificate.api.domain_validation_options : record.resource_record_name]
}

# ── Application Load Balancer ─────────────────────────────────────────────────

resource "aws_lb" "main" {
  name               = "${var.project}-alb-${var.env}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  # Enable access logs in S3 (useful for debugging)
  # access_logs { bucket = "your-log-bucket"; enabled = true }

  tags = { Name = "${var.project}-alb-${var.env}" }
}

# ── Target Group ──────────────────────────────────────────────────────────────
# Points at ECS tasks; ALB sends health checks every 30s

resource "aws_lb_target_group" "backend" {
  name        = "${var.project}-tg-${var.env}"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"   # Required for Fargate (tasks get IPs, not instance IDs)

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 10
    path                = "/health"
    matcher             = "200"
  }

  deregistration_delay = 30   # Wait 30s before removing deregistered targets

  tags = { Name = "${var.project}-tg-${var.env}" }
}

# ── HTTP Listener → redirect to HTTPS ────────────────────────────────────────

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ── HTTPS Listener → forward to ECS target group ─────────────────────────────

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.api.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}
