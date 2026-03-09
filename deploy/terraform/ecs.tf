resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = { Name = "${local.name_prefix}-cluster" }
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${local.name_prefix}/backend"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "supertokens" {
  name              = "/ecs/${local.name_prefix}/supertokens"
  retention_in_days = 30
}

# ── IAM ─────────────────────────────────────────────────

resource "aws_iam_role" "ecs_execution" {
  name = "${local.name_prefix}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task" {
  name = "${local.name_prefix}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task_ssm" {
  name = "${local.name_prefix}-ssm-exec"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "ssmmessages:CreateControlChannel",
        "ssmmessages:CreateDataChannel",
        "ssmmessages:OpenControlChannel",
        "ssmmessages:OpenDataChannel",
      ]
      Resource = "*"
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task_athena" {
  name = "${local.name_prefix}-athena-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "athena:StartQueryExecution",
          "athena:GetQueryExecution",
          "athena:GetQueryResults",
          "athena:StopQueryExecution",
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket",
          "s3:GetBucketLocation",
          "s3:PutObject",
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "glue:GetTable",
          "glue:GetTables",
          "glue:GetDatabase",
          "glue:GetDatabases",
        ]
        Resource = "*"
      },
    ]
  })
}

# ── ECS Service Discovery (SuperTokens) ────────────────

resource "aws_service_discovery_private_dns_namespace" "main" {
  name = "${local.name_prefix}.local"
  vpc  = aws_vpc.main.id
}

resource "aws_service_discovery_service" "supertokens" {
  name = "supertokens"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}

# ── SuperTokens Task ───────────────────────────────────

resource "aws_ecs_task_definition" "supertokens" {
  family                   = "${local.name_prefix}-supertokens"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.supertokens_cpu
  memory                   = var.supertokens_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn

  container_definitions = jsonencode([{
    name      = "supertokens"
    image     = var.supertokens_image
    essential = true

    portMappings = [{
      containerPort = 3567
      protocol      = "tcp"
    }]

    environment = [
      {
        name  = "POSTGRESQL_CONNECTION_URI"
        value = "postgresql://${var.db_username}:${var.db_password}@${aws_rds_cluster.main.endpoint}:5432/${var.db_name}"
      },
      {
        name  = "ACCESS_TOKEN_VALIDITY"
        value = "900"
      },
      {
        name  = "REFRESH_TOKEN_VALIDITY"
        value = "10080"
      },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.supertokens.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

resource "aws_ecs_service" "supertokens" {
  name            = "${local.name_prefix}-supertokens"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.supertokens.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.ecs.id]
  }

  service_registries {
    registry_arn = aws_service_discovery_service.supertokens.arn
  }
}

# ── Backend Task ───────────────────────────────────────

resource "aws_ecs_task_definition" "backend" {
  family                   = "${local.name_prefix}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.backend_cpu
  memory                   = var.backend_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "backend"
    image     = "${aws_ecr_repository.backend.repository_url}:latest"
    essential = true

    portMappings = [{
      containerPort = 3001
      protocol      = "tcp"
    }]

    environment = [
      { name = "PORT", value = "3001" },
      { name = "DB_HOST", value = aws_rds_cluster.main.endpoint },
      { name = "DB_PORT", value = "5432" },
      { name = "DB_NAME", value = var.db_name },
      { name = "DB_USER", value = var.db_username },
      { name = "DB_PASSWORD", value = var.db_password },
      { name = "SUPERTOKENS_CONNECTION_URI", value = "http://supertokens.${local.name_prefix}.local:3567" },
      { name = "API_DOMAIN", value = local.api_domain },
      { name = "WEBSITE_DOMAIN", value = local.web_domain },
      { name = "GOOGLE_OAUTH_CLIENT_ID", value = var.google_oauth_client_id },
      { name = "GOOGLE_OAUTH_CLIENT_SECRET", value = var.google_oauth_client_secret },
      { name = "GITHUB_OAUTH_CLIENT_ID", value = var.github_oauth_client_id },
      { name = "GITHUB_OAUTH_CLIENT_SECRET", value = var.github_oauth_client_secret },
      { name = "MICROSOFT_OAUTH_CLIENT_ID", value = var.microsoft_oauth_client_id },
      { name = "MICROSOFT_OAUTH_CLIENT_SECRET", value = var.microsoft_oauth_client_secret },
      { name = "ALLOWED_EMAIL_DOMAIN", value = var.allowed_email_domain },
      { name = "ANTHROPIC_API_KEY", value = var.anthropic_api_key },
      { name = "OPENAI_API_KEY", value = var.openai_api_key },
      { name = "GOOGLE_AI_API_KEY", value = var.google_ai_api_key },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.backend.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

resource "aws_ecs_service" "backend" {
  name                   = "${local.name_prefix}-backend"
  cluster                = aws_ecs_cluster.main.id
  task_definition        = aws_ecs_task_definition.backend.arn
  desired_count          = 1
  launch_type            = "FARGATE"
  enable_execute_command = true

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  health_check_grace_period_seconds = 60

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.ecs.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 3001
  }

  depends_on = [aws_lb_listener.http]
}
