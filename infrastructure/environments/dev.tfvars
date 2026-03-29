# Development Environment Configuration

# AWS Configuration
aws_region = "us-west-2"

# Project Configuration
project_name = "enterprise-web-crawler"
environment  = "dev"

# Network Configuration
vpc_cidr             = "10.0.0.0/16"
private_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
public_subnet_cidrs  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

# Database Configuration (Smaller instances for dev)
db_instance_class = "db.t3.micro"

# Cache Configuration (Smaller instances for dev)
redis_node_type = "cache.t3.micro"

# ECS Configuration (Smaller resources for dev)
ecs_task_cpu    = 256
ecs_task_memory = 512

# Auto Scaling Configuration (Lower limits for dev)
min_capacity = 1
max_capacity = 3

# SSL/Domain Configuration (Optional for dev)
# domain_name     = "dev-crawler.example.com"
# certificate_arn = ""