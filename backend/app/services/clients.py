"""Cliente con memoria (Tanda 3): fidelidad y perfil, con el teléfono como llave.

La fidelidad NO procesa dinero: solo cuenta cortes completados. El objetivo y
la recompensa viven en tenant.brand_config (editables sin código):
  brand_config["loyalty_target"] = 10
  brand_config["loyalty_reward"] = "El corte 10 va por la casa"
"""
from __future__ import annotations

from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Appointment, Barber, ClientNote, Tenant

DEFAULT_TARGET = 10
DEFAULT_REWARD = "El corte 10 va por la casa"


def loyalty_status(db: Session, tenant: Tenant, phone: str) -> dict:
    config = tenant.brand_config or {}
    target = max(2, int(config.get("loyalty_target", DEFAULT_TARGET)))
    reward = str(config.get("loyalty_reward", DEFAULT_REWARD))
    completed = db.scalar(
        select(func.count())
        .select_from(Appointment)
        .where(
            Appointment.tenant_id == tenant.id,
            Appointment.customer_whatsapp == phone,
            Appointment.status == "completado",
        )
    ) or 0
    progress = completed % target
    return {
        "completed_count": completed,
        "target": target,
        "progress": progress,
        "remaining": target - progress,
        "earned_rewards": completed // target,
        "reward": reward,
    }


def client_stats(db: Session, tenant: Tenant, phone: str) -> dict:
    tz = ZoneInfo(tenant.timezone)
    rows = list(
        db.scalars(
            select(Appointment).where(
                Appointment.tenant_id == tenant.id,
                Appointment.customer_whatsapp == phone,
            )
        )
    )
    completed = [a for a in rows if a.status == "completado"]
    names = [a.customer_name for a in sorted(rows, key=lambda a: a.created_at)]
    favorite = None
    if completed:
        counts: dict[int, int] = {}
        for appointment in completed:
            counts[appointment.barber_id] = counts.get(appointment.barber_id, 0) + 1
        favorite_id = max(counts, key=lambda k: counts[k])
        barber = db.get(Barber, favorite_id)
        favorite = barber.name if barber else None
    last_visit = max((a.starts_at for a in completed), default=None)
    return {
        "customer_name": names[-1] if names else None,
        "total_appointments": len(rows),
        "completed_count": len(completed),
        "cancelled_count": sum(1 for a in rows if a.status == "cancelado"),
        "no_show_count": sum(1 for a in rows if a.status == "no_show"),
        "favorite_barber": favorite,
        "last_visit_local": (
            last_visit.astimezone(tz).strftime("%Y-%m-%d") if last_visit else None
        ),
    }


def client_notes(db: Session, tenant: Tenant, phone: str) -> list[ClientNote]:
    return list(
        db.scalars(
            select(ClientNote)
            .where(
                ClientNote.tenant_id == tenant.id,
                ClientNote.customer_whatsapp == phone,
            )
            .order_by(ClientNote.id.desc())
        )
    )
