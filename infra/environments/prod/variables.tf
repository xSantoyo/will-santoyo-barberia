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

variable "n8n_host" {
  type        = string
  description = "Dominio de n8n, ej. n8n.badboysbarber.com"
}

variable "admin_cidr" {
  type        = string
  description = "CIDR con acceso SSH a la instancia de n8n, ej. 190.x.x.x/32"
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
variable "service_api_key" {
  type      = string
  sensitive = true
}
variable "n8n_webhook_secret" {
  type      = string
  sensitive = true
}
variable "meta_access_token" {
  type      = string
  sensitive = true
}
variable "meta_phone_number_id" {
  type      = string
  sensitive = true
}
variable "meta_app_secret" {
  type      = string
  sensitive = true
}
