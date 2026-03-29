# SQS Queues for Job Processing

# Main crawler jobs queue
resource "aws_sqs_queue" "crawler_jobs" {
  name                      = "${local.name_prefix}-crawler-jobs"
  delay_seconds             = 0
  max_message_size          = 262144
  message_retention_seconds = 1209600  # 14 days
  receive_wait_time_seconds = 20       # Long polling
  visibility_timeout_seconds = 300     # 5 minutes

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.crawler_jobs_dlq.arn
    maxReceiveCount     = 3
  })

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-crawler-jobs"
  })
}

# Dead letter queue for failed crawler jobs
resource "aws_sqs_queue" "crawler_jobs_dlq" {
  name                      = "${local.name_prefix}-crawler-jobs-dlq"
  message_retention_seconds = 1209600  # 14 days

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-crawler-jobs-dlq"
  })
}

# Analysis jobs queue
resource "aws_sqs_queue" "analysis_jobs" {
  name                      = "${local.name_prefix}-analysis-jobs"
  delay_seconds             = 0
  max_message_size          = 262144
  message_retention_seconds = 1209600
  receive_wait_time_seconds = 20
  visibility_timeout_seconds = 600     # 10 minutes for analysis

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.analysis_jobs_dlq.arn
    maxReceiveCount     = 3
  })

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-analysis-jobs"
  })
}

# Dead letter queue for failed analysis jobs
resource "aws_sqs_queue" "analysis_jobs_dlq" {
  name                      = "${local.name_prefix}-analysis-jobs-dlq"
  message_retention_seconds = 1209600

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-analysis-jobs-dlq"
  })
}

# Report generation queue
resource "aws_sqs_queue" "report_jobs" {
  name                      = "${local.name_prefix}-report-jobs"
  delay_seconds             = 0
  max_message_size          = 262144
  message_retention_seconds = 1209600
  receive_wait_time_seconds = 20
  visibility_timeout_seconds = 900     # 15 minutes for reports

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.report_jobs_dlq.arn
    maxReceiveCount     = 2
  })

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-report-jobs"
  })
}

# Dead letter queue for failed report jobs
resource "aws_sqs_queue" "report_jobs_dlq" {
  name                      = "${local.name_prefix}-report-jobs-dlq"
  message_retention_seconds = 1209600

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-report-jobs-dlq"
  })
}

# High priority queue for urgent tasks
resource "aws_sqs_queue" "high_priority_jobs" {
  name                      = "${local.name_prefix}-high-priority-jobs"
  delay_seconds             = 0
  max_message_size          = 262144
  message_retention_seconds = 604800   # 7 days
  receive_wait_time_seconds = 5        # Shorter polling for priority
  visibility_timeout_seconds = 180     # 3 minutes

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.high_priority_jobs_dlq.arn
    maxReceiveCount     = 5
  })

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-high-priority-jobs"
  })
}

# Dead letter queue for failed high priority jobs
resource "aws_sqs_queue" "high_priority_jobs_dlq" {
  name                      = "${local.name_prefix}-high-priority-jobs-dlq"
  message_retention_seconds = 1209600

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-high-priority-jobs-dlq"
  })
}

# CloudWatch Alarms for Queue Monitoring
resource "aws_cloudwatch_metric_alarm" "crawler_queue_depth" {
  alarm_name          = "${local.name_prefix}-crawler-queue-depth-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "ApproximateNumberOfMessages"
  namespace           = "AWS/SQS"
  period              = "300"
  statistic           = "Average"
  threshold           = "1000"
  alarm_description   = "This metric monitors crawler queue depth"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    QueueName = aws_sqs_queue.crawler_jobs.name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "dlq_messages" {
  alarm_name          = "${local.name_prefix}-dlq-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "ApproximateNumberOfMessages"
  namespace           = "AWS/SQS"
  period              = "300"
  statistic           = "Average"
  threshold           = "0"
  alarm_description   = "This metric monitors dead letter queue messages"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    QueueName = aws_sqs_queue.crawler_jobs_dlq.name
  }

  tags = local.common_tags
}

# SNS Topic for Alerts
resource "aws_sns_topic" "alerts" {
  name = "${local.name_prefix}-alerts"

  tags = local.common_tags
}