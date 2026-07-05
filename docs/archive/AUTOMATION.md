# [ARCHIVADO — ADR-009] Automatización con n8n

> ⛔ **Este documento está archivado.** El servicio n8n fue retirado junto con la
> integración de WhatsApp (ADR-009 en `docs/ARCHITECTURE.md`). Los workflows JSON
> siguen en `automation/workflows/` como referencia histórica; no se despliegan
> ni forman parte de docker-compose ni de Terraform.

Todos los flujos de notificación viven en n8n, desacoplados del backend (ADR-004):
el backend solo emite webhooks firmados y expone endpoints internos de consulta;
los textos, horarios y lógica de mensajería se editan visualmente en n8n sin
redesplegar nada.

## Importar los workflows

1. Abrir n8n (local: http://localhost:5678 con `docker compose up`).
2. Menú **Workflows → Import from file** → importar cada JSON de
   [`automation/workflows/`](../automation/workflows/).
3. Activar cada workflow (toggle **Active**).

Los workflows leen su configuración de **variables de entorno** del contenedor
n8n (ya definidas en `docker-compose.yml` para local, y en el `user_data` de la
instancia EC2 para prod):

| Variable | Local (compose) | Prod |
|---|---|---|
| `BACKEND_BASE_URL` | `http://backend:8000` | URL del API Gateway |
| `BACKEND_SERVICE_KEY` | `local-service-key` | Secrets Manager → `SERVICE_API_KEY` |
| `WEBHOOK_SECRET` | `local-webhook-secret` | Secrets Manager → `N8N_WEBHOOK_SECRET` |
| `META_ACCESS_TOKEN` | (vacío en local) | token permanente de Meta |
| `META_PHONE_NUMBER_ID` | (vacío en local) | ID del número emisor |

> Sin credenciales de Meta, los nodos de WhatsApp fallan pero el resto del flujo
> es verificable; el backend registra cada intento en `notification_log`.

## Workflows

### 01 — Confirmación de turno (`01-confirmacion-turno.json`)
- **Disparador:** `POST /webhook/appointment-created` (lo emite el backend al
  crear una reserva, pública o manual).
- **Seguridad:** primer nodo Code verifica la firma HMAC-SHA256 del header
  `X-BadBoys-Signature` con `WEBHOOK_SECRET`; si no coincide, aborta.
- **Acciones:** plantilla `confirmacion_turno` al cliente (con botón al enlace
  de gestión) + `notificacion_interna` al número del negocio.

### 02 — Notificación de cancelación (`02-cancelacion-turno.json`)
- **Disparador:** `POST /webhook/appointment-cancelled`.
- **Acciones:** `cancelacion_turno` al cliente + alerta al negocio indicando que
  el horario quedó libre (el horario se libera automáticamente en el sistema:
  el constraint solo cuenta turnos activos).

### 03 — Recordatorio 24h (`03-recordatorio-24h.json`)
- **Disparador:** cron cada hora.
- **Flujo:** `GET /api/v1/internal/appointments/upcoming-reminders` → un item por
  turno confirmado que empieza en <24 h y no tiene recordatorio → plantilla
  `recordatorio_24h` → `POST .../notification-log` para marcarlo (idempotencia:
  el backend excluye los ya marcados en la siguiente corrida).

### 04 — Resumen diario (`04-resumen-diario.json`)
- **Disparador:** cron `0 7 * * *` (7:00 a.m. — el workflow y el contenedor
  corren con timezone `America/Bogota`).
- **Flujo:** `GET /api/v1/internal/agenda/today` → arma el resumen del día por
  barbero → `notificacion_interna` al WhatsApp del negocio.

### 05 — Alerta de no-show (`05-alerta-no-show.json`)
- **Disparador:** cron `*/15 * * * *`.
- **Flujo:** `GET /api/v1/internal/appointments/overdue` (turnos aún `confirmado`
  cuya hora de inicio pasó hace >15 min) → si hay alguno, alerta interna al admin
  con la lista, para marcarlos como `en_curso`/`completado`/`no_show` en el panel.

## Fase 2 opcional (previstos, no incluidos en v1)

- **Solicitud de reseña:** cron que consulte turnos `completado` del día anterior
  y envíe agradecimiento + enlace de reseña (requiere plantilla nueva).
- **Reactivación de clientes:** cron semanal sobre clientes sin turnos en 60+
  días (requiere endpoint interno nuevo, trivial de añadir en
  `backend/app/routers/internal.py`).

## Contrato de los webhooks (backend → n8n)

Cuerpo JSON compacto (sin espacios) firmado con HMAC-SHA256:

```
X-BadBoys-Signature: hex(hmac_sha256(WEBHOOK_SECRET, body))
```

Ver el payload completo en `docs/ARCHITECTURE.md` §4. Importante: el backend
serializa con separadores compactos precisamente para que
`JSON.stringify(body)` en el nodo Code reproduzca los mismos bytes al verificar.

## Depuración

- **n8n → Executions:** cada corrida con su input/output por nodo.
- **Panel admin → notificaciones:** `notification_log` con estado
  `enviado/fallido` y el detalle del error de cada webhook del backend.
- Si un webhook del backend no llega: verificar `N8N_WEBHOOK_BASE` en el entorno
  del backend y que el workflow esté **Active** (los webhooks de n8n solo
  escuchan activos, o en modo test con el botón *Listen*).
