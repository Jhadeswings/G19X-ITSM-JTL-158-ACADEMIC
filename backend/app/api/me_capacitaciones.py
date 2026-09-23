"""Router Empleado: capacitaciones propias (Fase 4B).

Todo protegido con ``require_empleado`` con ownership estricto (§32).
Solo existe lo respaldado por los documentos (PRD §21.4, Especificación
§11, §31): registrar, listar y consultar. NO existen PATCH, DELETE ni
endpoints RH de capacitaciones.
"""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import empleado_id_propio, require_empleado
from app.core.db import get_db
from app.models.cuenta_acceso import CuentaAcceso
from app.schemas.capacitacion import (
    CapacitacionCreateIn,
    CapacitacionOut,
    CapacitacionPageOut,
)
from app.services import capacitacion_service

router = APIRouter(
    prefix="/me/trainings",
    tags=["me-capacitaciones"],
    dependencies=[Depends(require_empleado)],
)


@router.post("", response_model=CapacitacionOut, status_code=status.HTTP_201_CREATED)
def crear_capacitacion(
    datos: CapacitacionCreateIn,
    cuenta: CuentaAcceso = Depends(require_empleado),
    db: Session = Depends(get_db),
) -> CapacitacionOut:
    """Registra una capacitación propia (nombre, fecha, completado)."""
    return CapacitacionOut.model_validate(
        capacitacion_service.crear_capacitacion(
            db, empleado_id=empleado_id_propio(cuenta), datos=datos
        )
    )


@router.get("", response_model=CapacitacionPageOut)
def listar_capacitaciones(
    pagina: int = Query(1, ge=1),
    por_pagina: int = Query(20, ge=1, le=100),
    cuenta: CuentaAcceso = Depends(require_empleado),
    db: Session = Depends(get_db),
) -> CapacitacionPageOut:
    capacitaciones, total = capacitacion_service.listar_capacitaciones(
        db, empleado_id=empleado_id_propio(cuenta), pagina=pagina, por_pagina=por_pagina
    )
    return CapacitacionPageOut(
        total=total,
        pagina=pagina,
        por_pagina=por_pagina,
        items=[CapacitacionOut.model_validate(c) for c in capacitaciones],
    )


@router.get("/{capacitacion_id}", response_model=CapacitacionOut)
def consultar_capacitacion(
    capacitacion_id: int,
    cuenta: CuentaAcceso = Depends(require_empleado),
    db: Session = Depends(get_db),
) -> CapacitacionOut:
    """Consulta la capacitación propia. Una ajena responde 404 (§32)."""
    return CapacitacionOut.model_validate(
        capacitacion_service.obtener_capacitacion_propia(
            db, cuenta=cuenta, capacitacion_id=capacitacion_id
        )
    )
