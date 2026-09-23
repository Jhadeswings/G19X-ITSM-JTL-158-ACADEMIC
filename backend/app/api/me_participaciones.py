"""Router Empleado: participaciones propias (Fase 4B).

Todo protegido con ``require_empleado``. El ``empleado_id`` SIEMPRE se
deriva de la cuenta autenticada (§32): nunca del cliente.
"""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import empleado_id_propio, require_empleado
from app.core.db import get_db
from app.models.cuenta_acceso import CuentaAcceso
from app.schemas.participacion import (
    ParticipacionCreateIn,
    ParticipacionEmpleadoUpdateIn,
    ParticipacionOut,
    ParticipacionPageOut,
)
from app.services import participacion_service

router = APIRouter(
    prefix="/me/participations",
    tags=["me-participaciones"],
    dependencies=[Depends(require_empleado)],
)


@router.post("", response_model=ParticipacionOut, status_code=status.HTTP_201_CREATED)
def crear_participacion(
    datos: ParticipacionCreateIn,
    cuenta: CuentaAcceso = Depends(require_empleado),
    db: Session = Depends(get_db),
) -> ParticipacionOut:
    """Registro inicial con todos los indicadores (PRD §12)."""
    return ParticipacionOut.model_validate(
        participacion_service.crear_participacion(
            db, empleado_id=empleado_id_propio(cuenta), datos=datos
        )
    )


@router.get("", response_model=ParticipacionPageOut)
def listar_participaciones(
    pagina: int = Query(1, ge=1),
    por_pagina: int = Query(20, ge=1, le=100),
    cuenta: CuentaAcceso = Depends(require_empleado),
    db: Session = Depends(get_db),
) -> ParticipacionPageOut:
    participaciones, total = participacion_service.listar_participaciones(
        db, empleado_id=empleado_id_propio(cuenta), pagina=pagina, por_pagina=por_pagina
    )
    return ParticipacionPageOut(
        total=total,
        pagina=pagina,
        por_pagina=por_pagina,
        items=[ParticipacionOut.model_validate(p) for p in participaciones],
    )


@router.get("/{participacion_id}", response_model=ParticipacionOut)
def consultar_participacion(
    participacion_id: int,
    cuenta: CuentaAcceso = Depends(require_empleado),
    db: Session = Depends(get_db),
) -> ParticipacionOut:
    """Consulta la participación propia. Una ajena responde 404 (§32)."""
    return ParticipacionOut.model_validate(
        participacion_service.obtener_participacion_propia(
            db, cuenta=cuenta, participacion_id=participacion_id
        )
    )


@router.patch("/{participacion_id}", response_model=ParticipacionOut)
def actualizar_participacion(
    participacion_id: int,
    datos: ParticipacionEmpleadoUpdateIn,
    cuenta: CuentaAcceso = Depends(require_empleado),
    db: Session = Depends(get_db),
) -> ParticipacionOut:
    """Edición propia limitada a rol/entregables/horas (PRD §12.1).

    El esquema rechaza con 422 cualquier campo bloqueado o desconocido.
    """
    participacion = participacion_service.obtener_participacion_propia(
        db, cuenta=cuenta, participacion_id=participacion_id
    )
    return ParticipacionOut.model_validate(
        participacion_service.actualizar_participacion_empleado(db, participacion, datos)
    )
