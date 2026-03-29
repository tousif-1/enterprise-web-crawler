# Production Environment Configuration

# AWS Configuration
aws_region = "us-west-2"

# Project Configuration
project_name = "enterprise-web-crawler"
environment  = "prod"

# Network Configuration
vpc_cidr             = "10.2.0.0/16"
private_subnet_cidrs = ["10.2.1.0/24", "10.2.2.0/24", "10.2.3.0/24"]
public_subnet_cidrs  = ["10.2.101.0/24", "10.2.102.0/24", "10.2.103.0/24"]

# Database Configuration (Production-grade instances)
db_instance_class = "db.r5.large"

# Cache Configuration (Production-grade instances)
redis_node_type = "cache.r5.large"

# ECS Configuration (Production resources)
ecs_task_cpu    = 1024
ecs_task_memory = 2048

# Auto Scaling Configuration (Production limits)
min_capacity = 3
max_capacity = 20

# SSL/Domain Configuration (Required for production)
# domain_name     = "crawler.example.com"
# certificate_arn = "arn:aws:acm:us-west-2:123456789012:certificate/prod-cert-id"