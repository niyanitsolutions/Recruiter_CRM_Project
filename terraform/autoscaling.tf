################################################################################
# autoscaling.tf — ECS Application Auto Scaling
################################################################################
# Strategy: Target Tracking on CPU utilisation (70 %).
#   - Scale OUT when average CPU > 70 % for 2 consecutive minutes
#   - Scale IN  when average CPU < 70 % for 5 consecutive minutes (cooldown)
#   - Min tasks: var.ecs_min_tasks (default 1)
#   - Max tasks: var.ecs_max_tasks  (default 6)
################################################################################

# ── Auto Scaling Target ────────────────────────────────────────────────────────

resource "aws_appautoscaling_target" "ecs" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.backend.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.ecs_min_tasks
  max_capacity       = var.ecs_max_tasks
}

# ── Target Tracking: CPU Utilisation ──────────────────────────────────────────

resource "aws_appautoscaling_policy" "ecs_cpu" {
  name               = "${var.project}-cpu-tracking-${var.env}"
  service_namespace  = "ecs"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  policy_type        = "TargetTrackingScaling"

  target_tracking_scaling_policy_configuration {
    target_value       = var.autoscaling_cpu_target   # 70 %
    scale_in_cooldown  = 300   # seconds — wait 5 min before removing tasks
    scale_out_cooldown = 60    # seconds — react quickly on load spikes

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

# ── Target Tracking: Memory Utilisation ───────────────────────────────────────
# Secondary guard: also scale on memory so a memory-heavy workload doesn't OOM
# before the CPU alarm fires.

resource "aws_appautoscaling_policy" "ecs_memory" {
  name               = "${var.project}-memory-tracking-${var.env}"
  service_namespace  = "ecs"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  policy_type        = "TargetTrackingScaling"

  target_tracking_scaling_policy_configuration {
    target_value       = 80   # scale when memory > 80 %
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
  }
}

# ── CloudWatch Alarm: High CPU (informational SNS alert) ──────────────────────
# This alarm does NOT drive scaling (Target Tracking does that automatically).
# It exists solely to send an email/Slack notification when CPU is critically high.

resource "aws_cloudwatch_metric_alarm" "ecs_cpu_high" {
  alarm_name          = "${var.project}-ecs-cpu-high-${var.env}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 85   # alert if still high after auto-scaling tried

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.backend.name
  }

  alarm_description = "ECS CPU above 85% — check if max tasks limit was hit"
  alarm_actions     = []   # add SNS topic ARN here for email/Slack notifications
  ok_actions        = []

  tags = { Name = "${var.project}-cpu-alarm-${var.env}" }
}

# ── CloudWatch Alarm: Task Count at Maximum ───────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "ecs_tasks_max" {
  alarm_name          = "${var.project}-ecs-tasks-at-max-${var.env}"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "RunningTaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = 60
  statistic           = "Maximum"
  threshold           = var.ecs_max_tasks

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.backend.name
  }

  alarm_description = "ECS service has hit maximum task count — consider raising ecs_max_tasks"
  alarm_actions     = []

  tags = { Name = "${var.project}-tasks-max-alarm-${var.env}" }
}
