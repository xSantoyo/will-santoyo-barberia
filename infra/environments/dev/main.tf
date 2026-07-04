# Entorno dev: espejo de prod con huella mínima.
# Diferencias: sin Amplify (el frontend dev corre local), sin EC2 de n8n
# (n8n dev corre en docker-compose local), RDS sin deletion_protection.
terraform {
  required_version = ">= 1.7"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  backend "s3" {
    bucket  = "bad-boys-terraform-state" # mismo bucket, key distinta
    key     = "dev/terraform.tfstate"
    region  = "us-east-1"
    encrypt = true
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "bad-boys-platform"
      Environment = "dev"
      ManagedBy   = "terraform"
    }
  }
}

locals {
  name_prefix = "badboys-dev"
}

module "network" {
  source      = "../../modules/network"
  name_prefix = local.name_prefix
  vpc_cidr    = "10.30.0.0/16"
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

module "api" {
  source             = "../../modules/api"
  name_prefix        = local.name_prefix
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
  image_uri          = var.backend_image_uri
  cors_origins       = ["http://localhost:3000"]
  environment_variables = {
    ENVIRONMENT        = "dev"
    AWS_SECRETS_PREFIX = local.name_prefix
    CORS_ORIGINS       = "http://localhost:3000"
    PUBLIC_BASE_URL    = "http://localhost:3000"
    STORAGE_BACKEND    = "s3"
    S3_BUCKET          = module.storage.bucket_name
    CDN_BASE_URL       = "https://${module.storage.cloudfront_domain}"
  }
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "backend_image_uri" { type = string }

output "api_endpoint" { value = module.api.api_endpoint }
output "cloudfront_domain" { value = module.storage.cloudfront_domain }
