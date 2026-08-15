terraform {
  required_version = ">= 1.7"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  # Backend remoto: crear el bucket una única vez antes de `terraform init`.
  backend "s3" {
    bucket  = "bad-boys-terraform-state" # ajustar a un nombre global único
    key     = "prod/terraform.tfstate"
    region  = "us-east-1"
    encrypt = true
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "bad-boys-platform"
      Environment = "prod"
      ManagedBy   = "terraform"
    }
  }
}

locals {
  name_prefix = "badboys-prod"
}

module "network" {
  source      = "../../modules/network"
  name_prefix = local.name_prefix
}

module "database" {
  source             = "../../modules/database"
  name_prefix        = local.name_prefix
  vpc_id             = module.network.vpc_id
  vpc_cidr           = module.network.vpc_cidr
  private_subnet_ids = module.network.private_subnet_ids
}

module "storage" {
  source      = "../../modules/storage"
  name_prefix = local.name_prefix
  bucket_name = "${local.name_prefix}-media"
}

module "secrets" {
  source      = "../../modules/secrets"
  name_prefix = local.name_prefix
  secrets = {
    app = {
      JWT_SECRET = var.jwt_secret
    }
    database = {
      DATABASE_URL = "postgresql+psycopg://${module.database.db_username}:${module.database.db_password}@${module.database.db_endpoint}:5432/${module.database.db_name}"
    }
  }
}

module "api" {
  source             = "../../modules/api"
  name_prefix        = local.name_prefix
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
  image_uri          = var.backend_image_uri
  cors_origins       = [var.frontend_url]
  environment_variables = {
    ENVIRONMENT        = "prod"
    AWS_SECRETS_PREFIX = local.name_prefix
    CORS_ORIGINS       = var.frontend_url
    PUBLIC_BASE_URL    = var.frontend_url
    STORAGE_BACKEND    = "s3"
    S3_BUCKET          = module.storage.bucket_name
    CDN_BASE_URL       = "https://${module.storage.cloudfront_domain}"
  }
}

module "frontend" {
  source              = "../../modules/frontend"
  name_prefix         = local.name_prefix
  repository_url      = var.github_repository_url
  github_access_token = var.github_access_token
  branch_name         = "main"
  api_url             = module.api.api_endpoint
}

# Alarmas de seguridad: logins fallidos, bloqueos, firmas de webhook inválidas,
# honeypots y ráfagas de reservas → correo vía SNS (ver modules/monitoring).
module "monitoring" {
  source         = "../../modules/monitoring"
  name_prefix    = local.name_prefix
  log_group_name = module.api.log_group_name
  alert_email    = var.security_alert_email
}

output "api_endpoint" { value = module.api.api_endpoint }
output "frontend_url" { value = module.frontend.default_domain }
output "cloudfront_domain" { value = module.storage.cloudfront_domain }
