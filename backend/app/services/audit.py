"""Log de auditoría de acciones administrativas (sección 15 del spec)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import AdminUser, AuditLog


def record(
    db: Session,
    actor: AdminUser,
    action: str,
    entity: str,
    entity_id: int | None = None,
    payload: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            tenant_id=actor.tenant_id,
            actor_user_id=actor.id,
            actor_username=actor.username,
            action=action,
            entity=entity,
            entity_id=entity_id,
            payload=payload or {},
        )
    )
    # Se persiste junto con el commit de la operación principal.
