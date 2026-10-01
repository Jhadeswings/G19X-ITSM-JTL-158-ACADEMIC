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
    """Identidad de la cuenta autenticada.

    Expone además ``puesto`` y ``area`` del empleado autenticado (PRD §21.6
    "Mi cuenta"): son datos de SOLO LECTURA que ya pertenecen a ``Empleado``
    (ET §5). No se derivan ni se completan aquí, y este DTO no expone ninguna
    vía para modificarlos (los datos laborales los administra RH).

    Se leen SIEMPRE del empleado ligado a la cuenta autenticada (``sub`` del
    token, §32): el endpoint no acepta ``empleado_id`` del cliente. Si la cuenta
    no tiene empleado (p. ej. RH), los tres datos del empleado salen ``null``.
    """
    empleado_nombre = None
    puesto = None
    area = None
    if cuenta.empleado_id is not None:
        empleado = db.get(Empleado, cuenta.empleado_id)
        if empleado:
            empleado_nombre = empleado.nombre
            puesto = empleado.puesto
            area = empleado.area
    return MeOut(
        cuenta_id=cuenta.id,
        email=cuenta.email,
        rol=cuenta.rol,
        empleado_id=cuenta.empleado_id,
        empleado_nombre=empleado_nombre,
        puesto=puesto,
        area=area,
        must_change_password=cuenta.must_change_password,
    )
