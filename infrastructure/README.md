# Enterprise Web Crawler - AWS Infrastructure

This directory contains the AWS infrastructure as code (IaC) configuration for the Enterprise Web Crawler application using Terraform.

## Architecture Overview

The infrastructure deploys a scalable, secure, and highly available web crawler system on AWS with the following components:

### Core Services
- **ECS Fargate**: Container orchestration for frontend, backend, and crawler services
- **Application Load Balancer**: Traffic distribution and SSL termination
- **RDS PostgreSQL**: Primary database with read replica
- **ElastiCache Redis**: Caching and session management
- **OpenSearch**: Full-text search and indexing
- **S3**: File storage for reports and assets
- **SQS**: Message queuing for job processing

### Security & Networking
- **VPC**: Isolated network environment with public/private subnets
- **Security Groups**: Fine-grained network access control
- **NACLs**: Network-level security (mandatory for AWS deployment)
- **Secrets Manager**: Secure credential storage
- **IAM Roles**: Least-privilege access control

### Monitoring & Scaling
- **CloudWatch**: Logging and monitoring
- **Auto Scaling**: Automatic capacity management based on CPU, memory, and queue depth
- **Health Checks**: Application and infrastructure health monitoring

## Prerequisites

Before deploying, ensure you have:

1. **AWS CLI** configured with appropriate credentials
2. **Terraform** >= 1.0 installed
3. **Docker** installed and running
4. **Node.js** and **npm** installed
5. **Git** for version control

### AWS Permissions

Your AWS credentials need the following permissions:
- EC2 (VPC, Subnets, Security Groups, Load Balancers)
- ECS (Clusters, Services, Task Definitions)
- RDS (Instances, Subnet Groups, Parameter Groups)
- ElastiCache (Replication Groups, Subnet Groups)
- OpenSearch (Domains)
- S3 (Buckets, Objects)
- SQS (Queues)
- ECR (Repositories)
- IAM (Roles, Policies)
- Secrets Manager
- CloudWatch (Logs, Alarms)

## Quick Start

### 1. Configure Variables

Copy the example variables file and customize it:

```bash
cd infrastructure/terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your specific configuration:

```hcl
aws_region   = "us-west-2"
environment  = "dev"
project_name = "enterprise-web-crawler"

# Optional: SSL/Domain configuration
domain_name     = "crawler.example.com"
certificate_arn = "arn:aws:acm:us-west-2:123456789012:certificate/..."
```

### 2. Deploy Using Scripts

#### Option A: Automated Deployment (Recommended)

**Linux/macOS:**
```bash
./infrastructure/scripts/deploy.sh -e dev -r us-west-2
```

**Windows:**
```powershell
.\infrastructure\scripts\deploy.ps1 -Environment dev -Region us-west-2
```

#### Option B: Manual Deployment

```bash
# 1. Initialize Terraform
cd infrastructure/terraform
terraform init

# 2. Plan deployment
terraform plan -out=tfplan

# 3. Apply changes
terraform apply tfplan
```

### 3. Build and Deploy Application

The deployment script automatically builds and pushes Docker images to ECR, then updates ECS services.

For manual deployment:

```bash
# Build and push images
aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-west-2.amazonaws.com

docker build -f packages/frontend/Dockerfile -t <ecr-repo>/frontend:latest .
docker push <ecr-repo>/frontend:latest

# Repeat for backend and crawler services
```

## Configuration Options

### Environment Variables

The infrastructure supports multiple environments (dev, staging, prod) with different configurations:

| Variable | Description | Default |
|----------|-------------|---------|
| `aws_region` | AWS deployment region | `us-west-2` |
| `environment` | Environment name | `dev` |
| `project_name` | Project identifier | `enterprise-web-crawler` |
| `vpc_cidr` | VPC CIDR block | `10.0.0.0/16` |
| `db_instance_class` | RDS instance type | `db.t3.medium` |
| `redis_node_type` | ElastiCache node type | `cache.t3.micro` |
| `min_capacity` | Minimum ECS tasks | `2` |
| `max_capacity` | Maximum ECS tasks | `10` |

### Auto Scaling Configuration

The infrastructure includes comprehensive auto-scaling:

- **CPU-based scaling**: Scales when CPU > 70%
- **Memory-based scaling**: Scales when memory > 80%
- **Queue-based scaling**: Scales crawler based on SQS queue depth
- **Custom metrics**: CloudWatch alarms for application-specific metrics

### Security Configuration

#### Network Security (Mandatory for AWS)
- **VPC**: Isolated network with public/private subnets across 3 AZs
- **Security Groups**: Application-level firewall rules
- **NACLs**: Network-level access control lists
- **Private Subnets**: Database and application services in private subnets
- **NAT Gateways**: Secure outbound internet access

#### Data Security
- **Encryption at Rest**: RDS, ElastiCache, S3, and EBS encryption
- **Encryption in Transit**: TLS/SSL for all communications
- **Secrets Management**: AWS Secrets Manager for credentials
- **IAM Roles**: Least-privilege access control

## Monitoring and Logging

### CloudWatch Integration
- **Application Logs**: Centralized logging for all services
- **Metrics**: Custom and AWS metrics collection
- **Alarms**: Automated alerting for critical issues
- **Dashboards**: Real-time monitoring views

### Health Checks
- **Load Balancer**: HTTP health checks for all services
- **ECS**: Container health monitoring
- **Database**: RDS performance insights
- **Cache**: ElastiCache monitoring

## Scaling and Performance

### Horizontal Scaling
- **ECS Services**: Auto-scaling based on multiple metrics
- **Database**: Read replicas for query performance
- **Cache**: Redis cluster for high availability
- **Load Balancer**: Multi-AZ distribution

### Performance Optimization
- **Connection Pooling**: Database connection management
- **Caching Strategy**: Multi-layer caching (Redis, CDN)
- **Queue Management**: SQS for asynchronous processing
- **Resource Allocation**: Optimized CPU/memory allocation

## Disaster Recovery

### Backup Strategy
- **Database**: Automated daily backups with 7-day retention
- **Point-in-Time Recovery**: RDS PITR capability
- **Cross-AZ Deployment**: Multi-availability zone setup
- **Data Replication**: Read replicas and cache clustering

### High Availability
- **Multi-AZ**: Services deployed across multiple availability zones
- **Auto Recovery**: ECS service auto-recovery
- **Health Monitoring**: Automated failure detection and replacement
- **Load Distribution**: Traffic distribution across healthy instances

## Cost Optimization

### Resource Management
- **Right-sizing**: Appropriate instance types for workloads
- **Auto Scaling**: Scale down during low usage
- **Spot Instances**: Optional spot instance support for crawler workers
- **Lifecycle Policies**: Automated cleanup of old data and images

### Monitoring Costs
- **CloudWatch**: Cost monitoring and alerting
- **Resource Tagging**: Comprehensive cost allocation
- **Usage Reports**: Regular cost analysis and optimization

## Troubleshooting

### Common Issues

#### Deployment Failures
```bash
# Check Terraform state
terraform show

# Validate configuration
terraform validate

# Check AWS credentials
aws sts get-caller-identity
```

#### Service Health Issues
```bash
# Check ECS service status
aws ecs describe-services --cluster <cluster-name> --services <service-name>

# Check task logs
aws logs get-log-events --log-group-name /aws/ecs/<project>/backend
```

#### Database Connection Issues
```bash
# Test database connectivity
aws rds describe-db-instances --db-instance-identifier <db-identifier>

# Check security groups
aws ec2 describe-security-groups --group-ids <sg-id>
```

### Debugging Commands

```bash
# ECS service logs
aws logs tail /aws/ecs/<project>/backend --follow

# Database performance
aws rds describe-db-log-files --db-instance-identifier <db-id>

# Load balancer health
aws elbv2 describe-target-health --target-group-arn <tg-arn>
```

## Security Best Practices

### Network Security
- All database and cache services in private subnets
- Security groups with minimal required access
- NACLs for additional network-level protection
- VPC Flow Logs for network monitoring

### Application Security
- Secrets stored in AWS Secrets Manager
- IAM roles with least-privilege access
- Container image scanning enabled
- Regular security updates and patches

### Compliance
- Encryption at rest and in transit
- Audit logging enabled
- Access control and monitoring
- Regular security assessments

## Maintenance

### Regular Tasks
- **Security Updates**: Keep base images and dependencies updated
- **Backup Verification**: Test backup and restore procedures
- **Performance Review**: Monitor and optimize resource usage
- **Cost Review**: Regular cost analysis and optimization

### Automated Maintenance
- **Image Updates**: Automated base image updates
- **Backup Management**: Automated backup lifecycle
- **Log Rotation**: Automated log cleanup
- **Certificate Renewal**: Automated SSL certificate management

## Support and Documentation

### Additional Resources
- [AWS ECS Documentation](https://docs.aws.amazon.com/ecs/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)

### Getting Help
- Check CloudWatch logs for application issues
- Review Terraform state for infrastructure issues
- Use AWS Support for platform-specific problems
- Consult application documentation for feature-specific issues