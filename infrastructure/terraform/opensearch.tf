# OpenSearch (Elasticsearch) Configuration

# OpenSearch Domain
resource "aws_opensearch_domain" "main" {
  domain_name    = "${local.name_prefix}-search"
  engine_version = "OpenSearch_2.3"

  cluster_config {
    instance_type            = "t3.small.search"
    instance_count           = 3
    dedicated_master_enabled = true
    master_instance_type     = "t3.small.search"
    master_instance_count    = 3
    zone_awareness_enabled   = true

    zone_awareness_config {
      availability_zone_count = 3
    }
  }

  # Storage configuration
  ebs_options {
    ebs_enabled = true
    volume_type = "gp3"
    volume_size = 20
  }

  # Network configuration
  vpc_options {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.opensearch.id]
  }

  # Encryption
  encrypt_at_rest {
    enabled = true
  }

  node_to_node_encryption {
    enabled = true
  }

  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  # Access policy
  access_policies = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "*"
        }
        Action   = "es:*"
        Resource = "arn:aws:es:${var.aws_region}:${data.aws_caller_identity.current.account_id}:domain/${local.name_prefix}-search/*"
        Condition = {
          IpAddress = {
            "aws:sourceIp" = var.vpc_cidr
          }
        }
      }
    ]
  })

  # Advanced options
  advanced_options = {
    "rest.action.multi.allow_explicit_index" = "true"
  }

  # Logging
  log_publishing_options {
    cloudwatch_log_group_arn = aws_cloudwatch_log_group.opensearch_index.arn
    log_type                 = "INDEX_SLOW_LOGS"
    enabled                  = true
  }

  log_publishing_options {
    cloudwatch_log_group_arn = aws_cloudwatch_log_group.opensearch_search.arn
    log_type                 = "SEARCH_SLOW_LOGS"
    enabled                  = true
  }

  log_publishing_options {
    cloudwatch_log_group_arn = aws_cloudwatch_log_group.opensearch_es_app.arn
    log_type                 = "ES_APPLICATION_LOGS"
    enabled                  = true
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-opensearch"
  })

  depends_on = [aws_iam_service_linked_role.opensearch]
}

# Service-linked role for OpenSearch
resource "aws_iam_service_linked_role" "opensearch" {
  aws_service_name = "opensearchserverless.amazonaws.com"
}

# CloudWatch Log Groups for OpenSearch
resource "aws_cloudwatch_log_group" "opensearch_index" {
  name              = "/aws/opensearch/domains/${local.name_prefix}-search/index-slow-logs"
  retention_in_days = 7

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "opensearch_search" {
  name              = "/aws/opensearch/domains/${local.name_prefix}-search/search-slow-logs"
  retention_in_days = 7

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "opensearch_es_app" {
  name              = "/aws/opensearch/domains/${local.name_prefix}-search/es-application-logs"
  retention_in_days = 7

  tags = local.common_tags
}

# CloudWatch Log Resource Policy for OpenSearch
resource "aws_cloudwatch_log_resource_policy" "opensearch" {
  policy_name = "${local.name_prefix}-opensearch-log-policy"

  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "es.amazonaws.com"
        }
        Action = [
          "logs:PutLogEvents",
          "logs:CreateLogGroup",
          "logs:CreateLogStream"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*"
      }
    ]
  })
}