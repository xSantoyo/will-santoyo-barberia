"""Correos transaccionales vía Resend (ronda de stack, jul-2026).

Principios:
- El correo es un canal SECUNDARIO de cortesía. El canal oficial del cliente
  sigue siendo el código de gestión en pantalla (ADR-009): el campo de email es
  opcional y nada del flujo depende de que el correo llegue.
- Opt-in por despliegue: con RESEND_API_KEY se envía por la API de Resend
  (POST https://api.resend.com/emails, Bearer auth); sin key, el correo se
  escribe como archivo .html en un outbox local — visible en desarrollo, cero
  costo, cero cuentas.
- Un fallo de envío JAMÁS rompe una reserva: se registra y se sigue.
- Idempotencia: cada correo se marca como enviado en la cita/pago
  (confirmation_email_sent_at, reminder_email_sent_at, detail.gift_email_sent).
- Recordatorios SIN cron: send_pending_reminders es un sweep perezoso invocado
  desde los mismos puntos de tráfico que release_unconfirmed — coherente con la
  arquitectura sin schedulers del proyecto.
"""
from __future__ import annotations

import logging
import re
import time
from datetime import timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..config import get_settings
from ..db import utcnow
from ..models import Appointment, Tenant

logger = logging.getLogger("willbarbershop.email")

# Paleta de la marca (inline: los clientes de correo no cargan CSS externo)
INK = "#0B0B0C"
INK_2 = "#141416"
GOLD = "#C9A24B"
BONE = "#F5F1E8"
BONE_2 = "#B9B3A6"
MONO = "'IBM Plex Mono','Courier New',monospace"

# strftime usa el locale del sistema (C = inglés): los nombres van explícitos
SPANISH_DAYS = ("lunes", "martes", "miércoles", "jueves", "viernes",
                "sábado", "domingo")
SPANISH_MONTHS = ("enero", "febrero", "marzo", "abril", "mayo", "junio",
                  "julio", "agosto", "septiembre", "octubre", "noviembre",
                  "diciembre")


def _spanish_date(local) -> str:
    """'miércoles 15 de julio, 2026' — siempre en español, sin locale."""
    return (f"{SPANISH_DAYS[local.weekday()].capitalize()} {local.day} de "
            f"{SPANISH_MONTHS[local.month - 1]}, {local.year}")


# ---------------------------------------------------------------- envío

def send_email(*, to: str, subject: str, html: str, tag: str) -> bool:
    """Envía por Resend si hay API key; si no, escribe al outbox local.
    Devuelve True si el correo salió (o quedó en el outbox). Nunca lanza."""
    settings = get_settings()
    if not settings.email_enabled:
        return _write_outbox(to=to, subject=subject, html=html, tag=tag)
    import httpx

    try:
        response = httpx.post(
            settings.resend_api_url,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={
                "from": settings.email_from,
                "to": [to],
                "subject": subject,
                "html": html,
                "tags": [{"name": "tipo", "value": tag}],
            },
            timeout=10,
        )
        if response.status_code in (200, 201):
            logger.info("Correo '%s' enviado a %s (Resend)", tag, to)
            return True
        logger.warning("Resend respondió %s para '%s' a %s: %s",
                       response.status_code, tag, to, response.text[:300])
        return False
    except Exception:
        logger.exception("Error enviando correo '%s' a %s", tag, to)
        return False


def _write_outbox(*, to: str, subject: str, html: str, tag: str) -> bool:
    """Modo desarrollo: cada correo queda como .html en el outbox local."""
    settings = get_settings()
    try:
        outbox = Path(settings.email_outbox_dir)
        outbox.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y%m%d-%H%M%S")
        path = outbox / f"{stamp}-{tag}-{re.sub(r'[^a-z0-9]+', '_', to)}.html"
        path.write_text(
            f"<!-- to: {to} | subject: {subject} -->\n{html}", encoding="utf-8"
        )
        logger.info("Correo '%s' para %s escrito en outbox: %s", tag, to, path)
        return True
    except Exception:
        logger.exception("No se pudo escribir el outbox para %s", to)
        return False


# ---------------------------------------------------------------- plantillas

def _layout(tenant: Tenant, title: str, body: str) -> str:
    """Esqueleto de correo con la identidad de Will: tinta, oro y mono."""
    return f"""\
<div style="margin:0;padding:32px 16px;background:{INK};font-family:Inter,Helvetica,Arial,sans-serif;color:{BONE};">
  <div style="max-width:520px;margin:0 auto;">
    <p style="margin:0 0 4px;font-size:26px;font-weight:800;letter-spacing:1px;color:{BONE};">
      BAD <span style="color:{GOLD};">BOYS</span>
    </p>
    <p style="margin:0 0 20px;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:{BONE_2};">
      {tenant.name}
    </p>
    <div style="border:1px solid #2a2a2d;background:{INK_2};padding:28px 24px;">
      <h1 style="margin:0 0 16px;font-size:22px;color:{GOLD};">{title}</h1>
      {body}
    </div>
    <p style="margin:16px 0 0;font-size:11px;color:{BONE_2};">
      Este correo es una copia de cortesía. Tu código en pantalla siempre es la
      llave de tu turno — guárdalo.
    </p>
  </div>
</div>"""


def _code_plate(code: str) -> str:
    return f"""\
<div style="margin:18px 0;padding:18px;background:{INK};border:1px solid {GOLD};text-align:center;">
  <p style="margin:0 0 6px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:{BONE_2};">
    Tu código de gestión
  </p>
  <p style="margin:0;font-family:{MONO};font-size:30px;letter-spacing:8px;color:{BONE};">{code}</p>
</div>"""


def _row(label: str, value: str) -> str:
    return (
        f'<tr><td style="padding:4px 12px 4px 0;font-size:13px;color:{BONE_2};">{label}</td>'
        f'<td style="padding:4px 0;font-size:13px;color:{BONE};">{value}</td></tr>'
    )


def _ticket_url(code: str) -> str:
    return f"{get_settings().public_base_url}/turno/{code}"


def _button(url: str, label: str) -> str:
    return f"""\
<p style="margin:20px 0 4px;text-align:center;">
  <a href="{url}" style="display:inline-block;padding:13px 28px;background:{GOLD};color:{INK};
     font-weight:700;font-size:14px;text-decoration:none;letter-spacing:1px;">{label}</a>
</p>"""


def booking_confirmation_html(appointment: Appointment, tenant: Tenant) -> str:
    tz = ZoneInfo(tenant.timezone)
    local = appointment.starts_at.astimezone(tz)
    services = ", ".join(s.name for s in appointment.services)
    body = f"""\
<p style="margin:0 0 14px;font-size:14px;color:{BONE};">
  {appointment.customer_name}, tu silla queda reservada. Estos son los datos:
</p>
<table style="border-collapse:collapse;">
  {_row("Fecha", _spanish_date(local))}
  {_row("Hora", local.strftime("%H:%M"))}
  {_row("Barbero", appointment.professional.name)}
  {_row("Servicios", services)}
  {_row("Turno del día", f"#{appointment.daily_number}")}
  {_row("Total (se paga en el local)", f"$ {appointment.total_cop:,}".replace(",", "."))}
</table>
{_code_plate(appointment.manage_code)}
{_button(_ticket_url(appointment.manage_code), "VER MI TIQUETE VIVO")}
<p style="margin:14px 0 0;font-size:12px;color:{BONE_2};text-align:center;">
  Desde tu tiquete puedes seguir la fila en vivo, confirmar tu asistencia o
  cancelar si no puedes ir.
</p>"""
    return _layout(tenant, "Turno confirmado", body)


def attendance_reminder_html(appointment: Appointment, tenant: Tenant) -> str:
    tz = ZoneInfo(tenant.timezone)
    local = appointment.starts_at.astimezone(tz)
    settings = get_settings()
    deadline = (appointment.starts_at
                - timedelta(hours=settings.attendance_deadline_hours)).astimezone(tz)
    body = f"""\
<p style="margin:0 0 14px;font-size:14px;color:{BONE};">
  {appointment.customer_name}, tu turno con {appointment.professional.name} es el
  <strong>{local.strftime("%d/%m a las %H:%M")}</strong>. Confírmanos que sigues
  en pie — si no confirmas antes de las <strong>{deadline.strftime("%H:%M")}</strong>,
  el cupo se libera automáticamente para otra persona.
</p>
{_button(_ticket_url(appointment.manage_code), "CONFIRMAR MI ASISTENCIA")}
{_code_plate(appointment.manage_code)}"""
    return _layout(tenant, "¿Sigues en pie para tu corte?", body)


def send_booking_confirmation(db: Session, tenant: Tenant,
                              appointment: Appointment) -> bool:
    """Correo de confirmación (una sola vez). Se llama cuando el turno queda
    CONFIRMADO: al crear la reserva sin anticipo, o al aprobarse el anticipo."""
    if not appointment.customer_email or appointment.confirmation_email_sent_at:
        return False
    tz = ZoneInfo(tenant.timezone)
    local = appointment.starts_at.astimezone(tz)
    sent = send_email(
        to=appointment.customer_email,
        subject=f"Tu turno en {tenant.name} — {local.strftime('%d/%m %H:%M')} "
                f"(código {appointment.manage_code})",
        html=booking_confirmation_html(appointment, tenant),
        tag="confirmacion",
    )
    if sent:
        appointment.confirmation_email_sent_at = utcnow()
        db.commit()
    return sent


def send_pending_reminders(db: Session, tenant: Tenant) -> int:
    """Sweep perezoso de recordatorios de confirmación de asistencia.

    Sin cron (a propósito, como release_unconfirmed): se invoca desde los
    puntos de tráfico (disponibilidad, fila, dashboard). Envía el recordatorio
    a turnos cuyo período de confirmación está ABIERTO, tienen correo y aún no
    lo recibieron. Volumen esperado: puñados por día — cabe en el request."""
    settings = get_settings()
    now = utcnow()
    opens = timedelta(hours=settings.attendance_opens_hours)
    deadline = timedelta(hours=settings.attendance_deadline_hours)

    candidates = db.scalars(
        select(Appointment)
        .options(selectinload(Appointment.services), selectinload(Appointment.professional))
        .where(
            Appointment.tenant_id == tenant.id,
            Appointment.status == "confirmado",
            Appointment.customer_email.is_not(None),
            Appointment.reminder_email_sent_at.is_(None),
            Appointment.attendance_confirmed_at.is_(None),
            Appointment.starts_at > now + deadline,   # su ventana no ha vencido
            Appointment.starts_at <= now + opens,     # y ya está abierta
        )
    )
    sent_count = 0
    for appointment in candidates:
        # Antelación en Python (SQLite no hace aritmética de intervalos):
        # las reservas de último minuto no requieren confirmación ni recordatorio
        if appointment.created_at > appointment.starts_at - opens:
            continue
        tz = ZoneInfo(tenant.timezone)
        local = appointment.starts_at.astimezone(tz)
        if send_email(
            to=appointment.customer_email,
            subject=f"Confirma tu turno de {local.strftime('%H:%M')} en {tenant.name}",
            html=attendance_reminder_html(appointment, tenant),
            tag="recordatorio",
        ):
            appointment.reminder_email_sent_at = utcnow()
            sent_count += 1
    if sent_count:
        db.commit()
    return sent_count
