################################################################################
# redis.tf — ElastiCache Redis (single-node, private subnet)
################################################################################

# ── Subnet Group ──────────────────────────────────────────────────────────────
# ElastiCache must be placed in at least one private subnet

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.project}-redis-subnet-${var.env}"
  subnet_ids = aws_subnet.private[*].id

  tags = { Name = "${var.project}-redis-subnet-${var.env}" }
}

# ── Parameter Group ───────────────────────────────────────────────────────────
# Tune Redis for a small SaaS workload:
#   maxmemory-policy = allkeys-lru  →  evict least-recently-used keys when full
#   notify-keyspace-events = ""     →  disable keyspace notifications (saves CPU)

resource "aws_elasticache_parameter_group" "redis" {
  name   = "${var.project}-redis-params-${var.env}"
  family = "redis7"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  tags = { Name = "${var.project}-redis-params-${var.env}" }
}

# ── Redis Cluster ─────────────────────────────────────────────────────────────
# Single-node (no replication) for cost-efficiency in dev/staging.
# For production: set num_cache_nodes=2 and enable automatic_failover_enabled.

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${var.project}-redis-${var.env}"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type   # cache.t3.micro (~$13/mo)
  num_cache_nodes      = 1
  parameter_group_name = aws_elasticache_parameter_group.redis.name
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.redis.id]
  port                 = 6379

  # Maintenance window (low-traffic period — Sunday 3-4 AM UTC)
  maintenance_window = "sun:03:00-sun:04:00"

  # Automatic minor version upgrades
  auto_minor_version_upgrade = true

  # Snapshot / backup (1-day retention)
  snapshot_retention_limit = 1
  snapshot_window          = "02:00-03:00"   # daily snapshot at 2 AM UTC

  apply_immediately = false   # apply changes during next maintenance window

  tags = { Name = "${var.project}-redis-${var.env}" }
}
