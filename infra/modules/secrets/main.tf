# Secrets Manager: un secreto JSON por dominio de credenciales.
variable "name_prefix" { type = string }
variable "secrets" {
  type        = map(map(string))
  sensitive   = true
  description = "Mapa nombre-de-secreto => pares clave/valor"
}

resource "aws_secretsmanager_secret" "this" {
  for_each = var.secrets
  name     = "${var.name_prefix}/${each.key}"
}

resource "aws_secretsmanager_secret_version" "this" {
  for_each      = var.secrets
  secret_id     = aws_secretsmanager_secret.this[each.key].id
  secret_string = jsonencode(each.value)
}

output "secret_arns" {
  value = { for k, s in aws_secretsmanager_secret.this : k => s.arn }
}
