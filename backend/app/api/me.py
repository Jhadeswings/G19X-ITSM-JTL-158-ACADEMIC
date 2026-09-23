"""Endpoint de identidad (Fase 3).

GET /api/v1/me es el endpoint protegido real de esta fase: devuelve la
identidad del usuario autenticado. El ``cuenta_id`` y el ``empleado_id``
provienen SIEMPRE del token validado en backend, nunca del cliente (§32).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models.cuenta_acceso import CuentaAcceso
from app.models.empleado import Empleado
from app.schemas.auth import MeOut

router = APIRouter(prefix="/me", tags=["me"])


@router.get("", response_model=MeOut)
def quien_soy(
    cuenta: CuentaAcceso = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MeOut:
    """Identidad de la cuenta autenticada."""
    empleado_nombre = None
    if cuenta.empleado_id is not None:
        empleado = db.get(Empleado, cuenta.empleado_id)
        empleado_nombre = empleado.nombre if empleado else None
    return MeOut(
        cuenta_id=cuenta.id,
        email=cuenta.email,
        rol=cuenta.rol,
        empleado_id=cuenta.empleado_id,
        empleado_nombre=empleado_nombre,
        must_change_password=cuenta.must_change_password,
    )
