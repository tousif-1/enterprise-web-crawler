# Auto Scaling Configuration for ECS Services

# Auto Scaling Target for Frontend
resource "aws_appautoscaling_target" "frontend" {
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.frontend.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"

  tags = local.common_tags
}

# Auto Scaling Policy for Frontend - CPU
resource "aws_appautoscaling_policy" "frontend_cpu" {
  name               = "${local.name_prefix}-frontend-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.frontend.resource_id
  scalable_dimension = aws_appautoscaling_target.frontend.scalable_dimension
  service_namespace  = aws_appautoscaling_target.frontend.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 300
  }
}

# Auto Scaling Policy for Frontend - Memory
resource "aws_appautoscaling_policy" "frontend_memory" {
  name               = "${local.name_prefix}-frontend-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.frontend.resource_id
  scalable_dimension = aws_appautoscaling_target.frontend.scalable_dimension
  service_namespace  = aws_appautoscaling_target.frontend.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 80.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 300
  }
}

# Auto Scaling Target for Backend
resource "aws_appautoscaling_target" "backend" {
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.backend.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"

  tags = local.common_tags
}

# Auto Scaling Policy for Backend - CPU
resource "aws_appautoscaling_policy" "backend_cpu" {
  name               = "${local.name_prefix}-backend-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.backend.resource_id
  scalable_dimension = aws_appautoscaling_target.backend.scalable_dimension
  service_namespace  = aws_appautoscaling_target.backend.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 300
  }
}

# Auto Scaling Policy for Backend - Memory
resource "aws_appautoscaling_policy" "backend_memory" {
  name               = "${local.name_prefix}-backend-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.backend.resource_id
  scalable_dimension = aws_appautoscaling_target.backend.scalable_dimension
  service_namespace  = aws_appautoscaling_target.backend.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 80.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 300
  }
}

# Auto Scaling Target for Crawler
resource "aws_appautoscaling_target" "crawler" {
  max_capacity       = var.max_capacity * 2  # Crawler can scale higher for processing
  min_capacity       = var.min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.crawler.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"

  tags = local.common_tags
}

# Auto Scaling Policy for Crawler - CPU
resource "aws_appautoscaling_policy" "crawler_cpu" {
  name               = "${local.name_prefix}-crawler-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.crawler.resource_id
  scalable_dimension = aws_appautoscaling_target.crawler.scalable_dimension
  service_namespace  = aws_appautoscaling_target.crawler.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 60.0  # Lower threshold for crawler to handle spikes
    scale_in_cooldown  = 600   # Longer cooldown for crawler
    scale_out_cooldown = 300
  }
}

# Auto Scaling Policy for Crawler - Memory
resource "aws_appautoscaling_policy" "crawler_memory" {
  name               = "${local.name_prefix}-crawler-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.crawler.resource_id
  scalable_dimension = aws_appautoscaling_target.crawler.scalable_dimension
  service_namespace  = aws_appautoscaling_target.crawler.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 70.0  # Lower threshold for memory-intensive crawling
    scale_in_cooldown  = 600
    scale_out_cooldown = 300
  }
}

# Custom CloudWatch Metric for Queue Depth Scaling
resource "aws_cloudwatch_metric_alarm" "crawler_queue_depth" {
  alarm_name          = "${local.name_prefix}-crawler-queue-depth"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "ApproximateNumberOfMessages"
  namespace           = "AWS/SQS"
  period              = "300"
  statistic           = "Average"
  threshold           = "100"
  alarm_description   = "This metric monitors crawler queue depth"
  alarm_actions       = [aws_appautoscaling_policy.crawler_scale_up.arn]
  ok_actions          = [aws_appautoscaling_policy.crawler_scale_down.arn]

  dimensions = {
    QueueName = aws_sqs_queue.crawler_jobs.name
  }

  tags = local.common_tags
}

# Step Scaling Policy for Queue-based Scaling
resource "aws_appautoscaling_policy" "crawler_scale_up" {
  name               = "${local.name_prefix}-crawler-scale-up"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.crawler.resource_id
  scalable_dimension = aws_appautoscaling_target.crawler.scalable_dimension
  service_namespace  = aws_appautoscaling_target.crawler.service_namespace

  step_scaling_policy_configuration {
    adjustment_type         = "ChangeInCapacity"
    cooldown               = 300
    metric_aggregation_type = "Average"

    step_adjustment {
      metric_interval_lower_bound = 0
      scaling_adjustment          = 2
    }
  }
}

resource "aws_appautoscaling_policy" "crawler_scale_down" {
  name               = "${local.name_prefix}-crawler-scale-down"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.crawler.resource_id
  scalable_dimension = aws_appautoscaling_target.crawler.scalable_dimension
  service_namespace  = aws_appautoscaling_target.crawler.service_namespace

  step_scaling_policy_configuration {
    adjustment_type         = "ChangeInCapacity"
    cooldown               = 600
    metric_aggregation_type = "Average"

    step_adjustment {
      metric_interval_upper_bound = 0
      scaling_adjustment          = -1
    }
  }
}