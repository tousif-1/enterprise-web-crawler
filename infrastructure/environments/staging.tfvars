# Staging Environment Configuration

# AWS Configuration
aws_region = "us-west-2"

# Project Configuration
project_name = "enterprise-web-crawler"
environment  = "staging"

# Network Configuration
vpc_cidr             = "10.1.0.0/16"
private_subnet_cidrs = ["10.1.1.0/24", "10.1.2.0/24", "10.1.3.0/24"]
public_subnet_cidrs  = ["10.1.101.0/24", "10.1.102.0/24", "10.1.103.0/24"]

# Database Configuration (Medium instances for staging)
db_instance_class = "db.t3.small"

# Cache Configuration (Medium instances for staging)
redis_node_type = "cache.t3.small"

# ECS Configuration (Medium resources for staging)
ecs_task_cpu    = 512
ecs_task_memory = 1024

# Auto Scaling Configuration (Medium limits for staging)
min_capacity = 2
max_capacity = 6

# SSL/Domain Configuration
# domain_name     = "staging-crawler.example.com"
# certificate_arn = "arn:aws:acm:us-west-2:123456789012:certificate/staging-cert-id"