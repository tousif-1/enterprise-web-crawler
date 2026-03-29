# Enterprise Web Crawler - Infrastructure Makefile

# Default values
ENVIRONMENT ?= dev
REGION ?= us-west-2
PROJECT_NAME ?= enterprise-web-crawler

# Terraform directory
TERRAFORM_DIR = terraform
SCRIPTS_DIR = scripts

# Colors for output
RED = \033[0;31m
GREEN = \033[0;32m
YELLOW = \033[1;33m
BLUE = \033[0;34m
NC = \033[0m # No Color

.PHONY: help init plan apply deploy destroy clean validate format check-prereqs

# Default target
help: ## Show this help message
	@echo "Enterprise Web Crawler - Infrastructure Management"
	@echo ""
	@echo "Usage: make [target] [ENVIRONMENT=env] [REGION=region]"
	@echo ""
	@echo "Targets:"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(BLUE)%-15s$(NC) %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "Examples:"
	@echo "  make deploy ENVIRONMENT=dev"
	@echo "  make plan ENVIRONMENT=prod REGION=us-east-1"
	@echo "  make destroy ENVIRONMENT=staging"

check-prereqs: ## Check if all prerequisites are installed
	@echo "$(BLUE)[INFO]$(NC) Checking prerequisites..."
	@command -v aws >/dev/null 2>&1 || { echo "$(RED)[ERROR]$(NC) AWS CLI is not installed"; exit 1; }
	@command -v terraform >/dev/null 2>&1 || { echo "$(RED)[ERROR]$(NC) Terraform is not installed"; exit 1; }
	@command -v docker >/dev/null 2>&1 || { echo "$(RED)[ERROR]$(NC) Docker is not installed"; exit 1; }
	@command -v node >/dev/null 2>&1 || { echo "$(RED)[ERROR]$(NC) Node.js is not installed"; exit 1; }
	@command -v npm >/dev/null 2>&1 || { echo "$(RED)[ERROR]$(NC) npm is not installed"; exit 1; }
	@aws sts get-caller-identity >/dev/null 2>&1 || { echo "$(RED)[ERROR]$(NC) AWS credentials not configured"; exit 1; }
	@docker info >/dev/null 2>&1 || { echo "$(RED)[ERROR]$(NC) Docker is not running"; exit 1; }
	@echo "$(GREEN)[SUCCESS]$(NC) All prerequisites met"

init: check-prereqs ## Initialize Terraform
	@echo "$(BLUE)[INFO]$(NC) Initializing Terraform for $(ENVIRONMENT) environment..."
	@cd $(TERRAFORM_DIR) && terraform init
	@echo "$(GREEN)[SUCCESS]$(NC) Terraform initialized"

validate: ## Validate Terraform configuration
	@echo "$(BLUE)[INFO]$(NC) Validating Terraform configuration..."
	@cd $(TERRAFORM_DIR) && terraform validate
	@echo "$(GREEN)[SUCCESS]$(NC) Configuration is valid"

format: ## Format Terraform files
	@echo "$(BLUE)[INFO]$(NC) Formatting Terraform files..."
	@cd $(TERRAFORM_DIR) && terraform fmt -recursive
	@echo "$(GREEN)[SUCCESS]$(NC) Files formatted"

plan: init validate ## Create Terraform execution plan
	@echo "$(BLUE)[INFO]$(NC) Creating Terraform plan for $(ENVIRONMENT) environment..."
	@cd $(TERRAFORM_DIR) && terraform plan \
		-var-file="../environments/$(ENVIRONMENT).tfvars" \
		-var="aws_region=$(REGION)" \
		-out=tfplan-$(ENVIRONMENT)
	@echo "$(GREEN)[SUCCESS]$(NC) Plan created: tfplan-$(ENVIRONMENT)"

apply: ## Apply Terraform changes
	@echo "$(BLUE)[INFO]$(NC) Applying Terraform changes for $(ENVIRONMENT) environment..."
	@cd $(TERRAFORM_DIR) && terraform apply tfplan-$(ENVIRONMENT)
	@echo "$(GREEN)[SUCCESS]$(NC) Infrastructure deployed successfully"

deploy: check-prereqs ## Full deployment (tests, build, infrastructure, services)
	@echo "$(BLUE)[INFO]$(NC) Starting full deployment for $(ENVIRONMENT) environment..."
	@chmod +x $(SCRIPTS_DIR)/deploy.sh
	@$(SCRIPTS_DIR)/deploy.sh -e $(ENVIRONMENT) -r $(REGION) -p $(PROJECT_NAME)

deploy-force: check-prereqs ## Force deployment without confirmation
	@echo "$(BLUE)[INFO]$(NC) Starting forced deployment for $(ENVIRONMENT) environment..."
	@chmod +x $(SCRIPTS_DIR)/deploy.sh
	@$(SCRIPTS_DIR)/deploy.sh -e $(ENVIRONMENT) -r $(REGION) -p $(PROJECT_NAME) --force

deploy-skip-tests: check-prereqs ## Deploy without running tests
	@echo "$(BLUE)[INFO]$(NC) Starting deployment (skipping tests) for $(ENVIRONMENT) environment..."
	@chmod +x $(SCRIPTS_DIR)/deploy.sh
	@$(SCRIPTS_DIR)/deploy.sh -e $(ENVIRONMENT) -r $(REGION) -p $(PROJECT_NAME) --skip-tests

deploy-skip-build: check-prereqs ## Deploy without building images
	@echo "$(BLUE)[INFO]$(NC) Starting deployment (skipping build) for $(ENVIRONMENT) environment..."
	@chmod +x $(SCRIPTS_DIR)/deploy.sh
	@$(SCRIPTS_DIR)/deploy.sh -e $(ENVIRONMENT) -r $(REGION) -p $(PROJECT_NAME) --skip-build

destroy: ## Destroy infrastructure (with confirmation)
	@echo "$(YELLOW)[WARNING]$(NC) This will destroy all infrastructure for $(ENVIRONMENT) environment!"
	@read -p "Are you sure? Type 'yes' to continue: " confirm && [ "$$confirm" = "yes" ] || exit 1
	@echo "$(BLUE)[INFO]$(NC) Destroying infrastructure..."
	@cd $(TERRAFORM_DIR) && terraform destroy \
		-var-file="../environments/$(ENVIRONMENT).tfvars" \
		-var="aws_region=$(REGION)"
	@echo "$(GREEN)[SUCCESS]$(NC) Infrastructure destroyed"

destroy-force: ## Force destroy infrastructure without confirmation
	@echo "$(BLUE)[INFO]$(NC) Force destroying infrastructure for $(ENVIRONMENT) environment..."
	@cd $(TERRAFORM_DIR) && terraform destroy -auto-approve \
		-var-file="../environments/$(ENVIRONMENT).tfvars" \
		-var="aws_region=$(REGION)"
	@echo "$(GREEN)[SUCCESS]$(NC) Infrastructure destroyed"

output: ## Show Terraform outputs
	@echo "$(BLUE)[INFO]$(NC) Terraform outputs for $(ENVIRONMENT) environment:"
	@cd $(TERRAFORM_DIR) && terraform output

state: ## Show Terraform state
	@echo "$(BLUE)[INFO]$(NC) Terraform state for $(ENVIRONMENT) environment:"
	@cd $(TERRAFORM_DIR) && terraform show

refresh: ## Refresh Terraform state
	@echo "$(BLUE)[INFO]$(NC) Refreshing Terraform state for $(ENVIRONMENT) environment..."
	@cd $(TERRAFORM_DIR) && terraform refresh \
		-var-file="../environments/$(ENVIRONMENT).tfvars" \
		-var="aws_region=$(REGION)"

clean: ## Clean up temporary files
	@echo "$(BLUE)[INFO]$(NC) Cleaning up temporary files..."
	@cd $(TERRAFORM_DIR) && rm -f tfplan-* *.tfplan terraform.tfstate.backup
	@echo "$(GREEN)[SUCCESS]$(NC) Cleanup completed"

logs: ## Show application logs
	@echo "$(BLUE)[INFO]$(NC) Fetching logs for $(ENVIRONMENT) environment..."
	@aws logs tail /aws/ecs/$(PROJECT_NAME)-$(ENVIRONMENT)/backend --region $(REGION) --follow

health: ## Check application health
	@echo "$(BLUE)[INFO]$(NC) Checking application health for $(ENVIRONMENT) environment..."
	@LB_DNS=$$(aws elbv2 describe-load-balancers \
		--names $(PROJECT_NAME)-$(ENVIRONMENT)-alb \
		--region $(REGION) \
		--query 'LoadBalancers[0].DNSName' \
		--output text 2>/dev/null || echo "Not found"); \
	if [ "$$LB_DNS" != "Not found" ]; then \
		echo "Application URL: http://$$LB_DNS"; \
		curl -f -s "http://$$LB_DNS/health" && echo "$(GREEN)[SUCCESS]$(NC) Frontend is healthy" || echo "$(RED)[ERROR]$(NC) Frontend health check failed"; \
		curl -f -s "http://$$LB_DNS/api/health" && echo "$(GREEN)[SUCCESS]$(NC) Backend is healthy" || echo "$(RED)[ERROR]$(NC) Backend health check failed"; \
	else \
		echo "$(RED)[ERROR]$(NC) Load balancer not found"; \
	fi

status: ## Show deployment status
	@echo "$(BLUE)[INFO]$(NC) Deployment status for $(ENVIRONMENT) environment:"
	@echo "Region: $(REGION)"
	@echo "Project: $(PROJECT_NAME)"
	@echo ""
	@echo "ECS Cluster:"
	@aws ecs describe-clusters \
		--clusters $(PROJECT_NAME)-$(ENVIRONMENT)-cluster \
		--region $(REGION) \
		--query 'clusters[0].{Status:status,ActiveServices:activeServicesCount,RunningTasks:runningTasksCount}' \
		--output table 2>/dev/null || echo "Cluster not found"
	@echo ""
	@echo "ECS Services:"
	@aws ecs list-services \
		--cluster $(PROJECT_NAME)-$(ENVIRONMENT)-cluster \
		--region $(REGION) \
		--query 'serviceArns' \
		--output text 2>/dev/null | xargs -I {} aws ecs describe-services \
		--cluster $(PROJECT_NAME)-$(ENVIRONMENT)-cluster \
		--services {} \
		--region $(REGION) \
		--query 'services[].{Service:serviceName,Status:status,Desired:desiredCount,Running:runningCount}' \
		--output table 2>/dev/null || echo "No services found"

# Environment-specific shortcuts
dev: ## Deploy to development environment
	@$(MAKE) deploy ENVIRONMENT=dev

staging: ## Deploy to staging environment
	@$(MAKE) deploy ENVIRONMENT=staging

prod: ## Deploy to production environment
	@$(MAKE) deploy ENVIRONMENT=prod

# Quick commands
quick-deploy: deploy-skip-tests ## Quick deployment without tests

# Monitoring commands
monitor: ## Monitor application metrics
	@echo "$(BLUE)[INFO]$(NC) Opening CloudWatch dashboard..."
	@echo "Visit: https://$(REGION).console.aws.amazon.com/cloudwatch/home?region=$(REGION)#dashboards:"

# Backup commands
backup: ## Create infrastructure backup
	@echo "$(BLUE)[INFO]$(NC) Creating infrastructure backup..."
	@cd $(TERRAFORM_DIR) && terraform show > backup-$(ENVIRONMENT)-$$(date +%Y%m%d-%H%M%S).txt
	@echo "$(GREEN)[SUCCESS]$(NC) Backup created"