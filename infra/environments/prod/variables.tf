variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "backend_image_uri" {
  type        = string
  description = "URI de la imagen ECR del backend (publicada por CI)"
}

variable "frontend_url" {
  type        = string
  description = "URL pública del frontend (para CORS y enlaces en mensajes)"
}

variable "github_repository_url" { type = string }

variable "github_access_token" {
  type      = string
  sensitive = true
}

# --- Secretos de aplicación (pasar por TF_VAR_* o tfvars fuera de git) ---
variable "jwt_secret" {
  type      = string
  sensitive = true
}
