# Amplify Hosting para Next.js (SSR). Conectado al repo de GitHub.
variable "name_prefix" { type = string }
variable "repository_url" { type = string }
variable "github_access_token" {
  type      = string
  sensitive = true
}
variable "branch_name" { type = string }
variable "api_url" { type = string }

resource "aws_amplify_app" "frontend" {
  name         = "${var.name_prefix}-frontend"
  repository   = var.repository_url
  access_token = var.github_access_token
  platform     = "WEB_COMPUTE" # Next.js SSR

  build_spec = <<-EOT
    version: 1
    applications:
      - appRoot: frontend
        frontend:
          phases:
            preBuild:
              commands:
                - npm ci
            build:
              commands:
                - npm run build
          artifacts:
            baseDirectory: .next
            files:
              - '**/*'
          cache:
            paths:
              - node_modules/**/*
  EOT

  environment_variables = {
    NEXT_PUBLIC_API_URL   = var.api_url
    API_URL_INTERNAL      = var.api_url
    AMPLIFY_MONOREPO_APP_ROOT = "frontend"
  }
}

resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.frontend.id
  branch_name = var.branch_name
  framework   = "Next.js - SSR"
  stage       = "PRODUCTION"
}

output "amplify_app_id" { value = aws_amplify_app.frontend.id }
output "default_domain" { value = "https://${var.branch_name}.${aws_amplify_app.frontend.default_domain}" }
