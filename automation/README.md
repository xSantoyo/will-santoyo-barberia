# automation/

Workflows de n8n exportados (JSON importable) para la capa de automatización.

- `workflows/01-confirmacion-turno.json` — WhatsApp al cliente y al negocio al crear turno
- `workflows/02-cancelacion-turno.json` — avisos al cancelar (cliente + negocio)
- `workflows/03-recordatorio-24h.json` — cron horario de recordatorios
- `workflows/04-resumen-diario.json` — agenda del día a las 7:00 a.m.
- `workflows/05-alerta-no-show.json` — vigilancia de turnos vencidos cada 15 min

Documentación completa (importación, variables, contratos, depuración):
[docs/AUTOMATION.md](../docs/AUTOMATION.md) · Plantillas de Meta:
[docs/WHATSAPP_SETUP.md](../docs/WHATSAPP_SETUP.md)
