"""El único profesional del negocio: Will.

Este módulo es la frontera del concepto. Por encima de él nadie elige
profesional ni transporta un identificador: hay una sola agenda y se resuelve
aquí, en el servidor. Ningún `professional_id` cruza la frontera HTTP.
"""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Professional, Tenant


def get_professional(db: Session, tenant: Tenant) -> Professional:
    """La silla única del negocio.

    Falla ruidosamente si no existe: sin profesional no hay agenda que servir,
    y devolver None solo trasladaría el error a cada llamador.
    """
    professional = db.scalar(
        select(Professional)
        .where(Professional.tenant_id == tenant.id, Professional.is_active.is_(True))
        .order_by(Professional.id)
    )
    if professional is None:
        raise HTTPException(503, "La agenda todavía no está configurada.")
    return professional
