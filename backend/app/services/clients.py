"""Cliente con memoria (Tanda 3): fidelidad y perfil, con el teléfono como llave.

La fidelidad NO procesa dinero: solo cuenta cortes completados. El objetivo y
la recompensa viven en tenant.brand_config (editables sin código):
  brand_config["loyalty_target"] = 10
  brand_config["loyalty_reward"] = "El corte 10 va por la casa"
"""
from __future__ import annotations

import secrets
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Appointment, Barber, ClientNote, ClientReferralCode, Tenant

DEFAULT_TARGET = 10
DEFAULT_REWARD = "El corte 10 va por la casa"
REFERRAL_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def get_or_create_referral_code(db: Session, tenant: Tenant, phone: str) -> str:
    """Código único de referido por cliente (Tanda 4, B2), estilo BB-XXXX."""
    existing = db.scalar(
        select(ClientReferralCode).where(
            ClientReferralCode.tenant_id == tenant.id,
            ClientReferralCode.customer_whatsapp == phone,
        )
    )
    if existing:
        return existing.code
    for _ in range(20):
        code = "BB-" + "".join(secrets.choice(REFERRAL_ALPHABET) for _ in range(4))
        if not db.scalar(select(ClientReferralCode).where(ClientReferralCode.code == code)):
            row = ClientReferralCode(
                tenant_id=tenant.id, customer_whatsapp=phone, code=code
            )
            db.add(row)
            db.commit()
            return code
    raise RuntimeError("No fue posible generar un código de referido único")


def referral_bonus(db: Session, tenant: Tenant, phone: str) -> int:
    """Tijeras extra: referidos DISTINTOS que ya completaron al menos un corte."""
    my_code = db.scalar(
        select(ClientReferralCode.code).where(
            ClientReferralCode.tenant_id == tenant.id,
            ClientReferralCode.customer_whatsapp == phone,
        )
    )
    if not my_code:
        return 0
    return db.scalar(
        select(func.count(func.distinct(Appointment.customer_whatsapp))).where(
            Appointment.tenant_id == tenant.id,
            Appointment.referred_by_code == my_code,
            Appointment.status == "completado",
        )
    ) or 0


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
    bonus = referral_bonus(db, tenant, phone)
    total = completed + bonus
    progress = total % target
    return {
        "completed_count": completed,
        "referral_bonus": bonus,
        "target": target,
        "progress": progress,
        "remaining": target - progress,
        "earned_rewards": total // target,
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
