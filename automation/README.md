# automation/ — referencia histórica (ADR-009)

> ⛔ **No activo.** La capa n8n → WhatsApp fue retirada del proyecto en julio de
> 2026 (costo y verificación de negocio de Meta no justificados para el alcance
> actual). Estos JSON se conservan únicamente como referencia por si algún día se
> retoma un canal de notificaciones; no están en `docker-compose.yml`, ni en
> Terraform, ni en ningún proceso activo.

Contenido (workflows n8n exportados del diseño original):

- `workflows/01-confirmacion-turno.json`
- `workflows/02-cancelacion-turno.json`
- `workflows/03-recordatorio-24h.json`
- `workflows/04-resumen-diario.json`
- `workflows/05-alerta-no-show.json`

Documentación asociada: `docs/archive/AUTOMATION.md` y
`docs/archive/WHATSAPP_SETUP.md`. Decisión completa: ADR-009 en
[docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).
