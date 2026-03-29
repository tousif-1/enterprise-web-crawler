# Terraform Outputs

# VPC Outputs
output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "vpc_cidr_block" {
  description = "CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "private_subnet_ids" {
  description = "IDs of the private subnets"
  value       = aws_subnet.private[*].id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = aws_subnet.public[*].id
}

# Load Balancer Outputs
output "load_balancer_dns_name" {
  description = "DNS name of the load balancer"
  value       = aws_lb.main.dns_name
}

output "load_balancer_zone_id" {
  description = "Zone ID of the load balancer"
  value       = aws_lb.main.zone_id
}

output "load_balancer_arn" {
  description = "ARN of the load balancer"
  value       = aws_lb.main.arn
}

# ECS Outputs
output "ecs_cluster_id" {
  description = "ID of the ECS cluster"
  value       = aws_ecs_cluster.main.id
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = aws_ecs_cluster.main.arn
}

# Database Outputs
output "database_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.main.endpoint
  sensitive   = true
}

output "database_port" {
  description = "RDS instance port"
  value       = aws_db_instance.main.port
}

output "database_name" {
  description = "Database name"
  value       = aws_db_instance.main.db_name
}

output "database_username" {
  description = "Database username"
  value       = aws_db_instance.main.username
  sensitive   = true
}

output "database_password_secret_arn" {
  description = "ARN of the secret containing database password"
  value       = aws_secretsmanager_secret.db_password.arn
  sensitive   = true
}

# Redis Outputs
output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
  sensitive   = true
}

output "redis_port" {
  description = "ElastiCache Redis port"
  value       = aws_elasticache_replication_group.main.port
}

output "redis_auth_token_secret_arn" {
  description = "ARN of the secret containing Redis auth token"
  value       = aws_secretsmanager_secret.redis_auth_token.arn
  sensitive   = true
}

# OpenSearch Outputs
output "opensearch_endpoint" {
  description = "OpenSearch domain endpoint"
  value       = aws_opensearch_domain.main.endpoint
  sensitive   = true
}

output "opensearch_domain_arn" {
  description = "OpenSearch domain ARN"
  value       = aws_opensearch_domain.main.arn
}

# ECR Outputs
output "ecr_frontend_repository_url" {
  description = "URL of the frontend ECR repository"
  value       = aws_ecr_repository.frontend.repository_url
}

output "ecr_backend_repository_url" {
  description = "URL of the backend ECR repository"
  value       = aws_ecr_repository.backend.repository_url
}

output "ecr_crawler_repository_url" {
  description = "URL of the crawler ECR repository"
  value       = aws_ecr_repository.crawler.repository_url
}

# S3 Outputs
output "s3_app_storage_bucket" {
  description = "Name of the application storage S3 bucket"
  value       = aws_s3_bucket.app_storage.id
}

output "s3_app_storage_bucket_arn" {
  description = "ARN of the application storage S3 bucket"
  value       = aws_s3_bucket.app_storage.arn
}

# SQS Outputs
output "sqs_crawler_jobs_queue_url" {
  description = "URL of the crawler jobs SQS queue"
  value       = aws_sqs_queue.crawler_jobs.url
}

output "sqs_analysis_jobs_queue_url" {
  description = "URL of the analysis jobs SQS queue"
  value       = aws_sqs_queue.analysis_jobs.url
}

output "sqs_report_jobs_queue_url" {
  description = "URL of the report jobs SQS queue"
  value       = aws_sqs_queue.report_jobs.url
}

output "sqs_high_priority_jobs_queue_url" {
  description = "URL of the high priority jobs SQS queue"
  value       = aws_sqs_queue.high_priority_jobs.url
}

# Security Group Outputs
output "alb_security_group_id" {
  description = "ID of the ALB security group"
  value       = aws_security_group.alb.id
}

output "ecs_tasks_security_group_id" {
  description = "ID of the ECS tasks security group"
  value       = aws_security_group.ecs_tasks.id
}

output "rds_security_group_id" {
  description = "ID of the RDS security group"
  value       = aws_security_group.rds.id
}

output "elasticache_security_group_id" {
  description = "ID of the ElastiCache security group"
  value       = aws_security_group.elasticache.id
}

output "opensearch_security_group_id" {
  description = "ID of the OpenSearch security group"
  value       = aws_security_group.opensearch.id
}

# Application URL
output "application_url" {
  description = "URL to access the application"
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}"
}

# Deployment Information
output "deployment_info" {
  description = "Key deployment information"
  value = {
    region                = var.aws_region
    environment          = var.environment
    vpc_id              = aws_vpc.main.id
    cluster_name        = aws_ecs_cluster.main.name
    load_balancer_dns   = aws_lb.main.dns_name
    database_endpoint   = aws_db_instance.main.endpoint
    redis_endpoint      = aws_elasticache_replication_group.main.primary_endpoint_address
    opensearch_endpoint = aws_opensearch_domain.main.endpoint
  }
  sensitive = true
}