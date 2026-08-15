# Monitoreo de seguridad (ronda jul-2026).
#
# El backend emite cada evento de seguridad como línea JSON en stdout con el
# prefijo SECURITY (logger willsantoyo.security) → CloudWatch Logs. Aquí se
# convierten en métricas (metric filters) y alarmas que notifican por SNS al
# correo del negocio — nadie tiene que revisar logs a mano para enterarse de
# un ataque en curso.
#
# NOTA DE COSTO: metric filters son gratis; las alarmas cuestan ~0.10 USD/mes
# cada una (6 alarmas ≈ 0.60 USD/mes) y SNS por correo es gratis en la
# práctica. Ver checkpoint de costos en infra/README.md antes de aplicar.

variable "name_prefix" { type = string }
variable "log_group_name" {
  type        = string
  description = "Log group de la Lambda del API (de module.api)"
}
variable "alert_email" {
  type        = string
  description = "Correo que recibe las alertas de seguridad (confirma la suscripción SNS)"
}

resource "aws_sns_topic" "security_alerts" {
  name = "${var.name_prefix}-security-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.security_alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

locals {
  namespace = "WillSantoyo/Security"
  # Un metric filter por tipo de evento. El patrón busca la línea JSON que
  # emite el logger willsantoyo.security: SECURITY {"event": "<kind>", ...}
  events = {
    login_failed = {
      description = "Intentos de login fallidos"
      threshold   = 10 # >10 fallos en 5 min = campaña de fuerza bruta
      period      = 300
    }
    login_locked = {
      description = "Bloqueos temporales por fuerza bruta"
      threshold   = 1
      period      = 300
    }
    webhook_bad_signature = {
      description = "Webhook de pagos con firma/monto inválido"
      threshold   = 1
      period      = 300
    }
    honeypot = {
      description = "Bots atrapados por el honeypot"
      threshold   = 5
      period      = 900
    }
    rate_limited = {
      description = "Activaciones del rate limiter"
      threshold   = 10
      period      = 900
    }
    booking_burst = {
      description = "Ráfagas de reservas (misma IP o teléfono)"
      threshold   = 1
      period      = 900
    }
  }
}

resource "aws_cloudwatch_log_metric_filter" "security" {
  for_each       = local.events
  name           = "${var.name_prefix}-sec-${each.key}"
  log_group_name = var.log_group_name
  pattern        = "\"SECURITY\" \"\\\"event\\\": \\\"${each.key}\\\"\""

  metric_transformation {
    name          = each.key
    namespace     = local.namespace
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "security" {
  for_each            = local.events
  alarm_name          = "${var.name_prefix}-sec-${each.key}"
  alarm_description   = "${each.value.description} (>= ${each.value.threshold} en ${each.value.period / 60} min)"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = each.key
  namespace           = local.namespace
  period              = each.value.period
  statistic           = "Sum"
  threshold           = each.value.threshold
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.security_alerts.arn]
}

output "topic_arn" { value = aws_sns_topic.security_alerts.arn }
