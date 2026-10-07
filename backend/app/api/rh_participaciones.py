"""Router RH: participaciones dentro del alcance administrativo (Fase 4B).

Todo protegido con ``require_rh``:
- consulta de las participaciones de un empleado (§31 adaptado);
- consulta de las participaciones de un proyecto (RH-02.1, PRD §20.3/§12),
  con la identificación de presentación del empleado;
- corrección administrativa de una participación, auditada en la misma
  transacción (PRD §12.2, Especificación §9.1/§25).

RH NO registra participaciones: el registro es del Empleado (PRD §11.1);
no existe POST en este router.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require_rh
from app.core.db import get_db
from app.models.cuenta_acceso import CuentaAcceso
from app.schemas.participacion import (
    ParticipacionOut,
    ParticipacionPageOut,
    ParticipacionRhUpdateIn,
)
from app.services import participacion_service
from app.services.empleado_service import obtener_empleado
from app.services.proyecto_service import obtener_proyecto

router = APIRouter(
    prefix="/rh", tags=["rh-participaciones"], dependencies=[Depends(require_rh)]
)


@router.get(
    "/employees/{empleado_id}/participations", response_model=ParticipacionPageOut
)
def listar_participaciones_empleado(
    empleado_id: int,
    pagina: int = Query(1, ge=1),
    por_pagina: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> ParticipacionPageOut:
    """Lista paginada de las participaciones de un empleado (alcance RH)."""
    obtener_empleado(db, empleado_id)  # 404 si el empleado no existe
    participaciones, total = participacion_service.listar_participaciones(
        db, empleado_id=empleado_id, pagina=pagina, por_pagina=por_pagina
    )
    return ParticipacionPageOut(
        total=total,
        pagina=pagina,
        por_pagina=por_pagina,
        items=[ParticipacionOut.model_validate(p) for p in participaciones],
    )


@router.get(
    "/projects/{proyecto_id}/participations", response_model=ParticipacionPageOut
)
def listar_participaciones_proyecto(
    proyecto_id: int,
    pagina: int = Query(1, ge=1),
    por_pagina: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> ParticipacionPageOut:
    """Participaciones de un proyecto (RH-02.1, PRD §20.3/§12).

    Cada item incluye ``empleado_nombre``/``empleado_puesto`` (identificación
    de presentación, RH-02.1). El orden es cronológico de registro, no un
    ranking de participantes. 404 si el proyecto no existe.
    """
    obtener_proyecto(db, proyecto_id)  # 404 si el proyecto no existe
    participaciones, total = participacion_service.listar_participaciones_proyecto(
        db, proyecto_id=proyecto_id, pagina=pagina, por_pagina=por_pagina
    )
    return ParticipacionPageOut(
        total=total,
        pagina=pagina,
        por_pagina=por_pagina,
        items=[
            participacion_service.a_participacion_out_con_empleado(p)
            for p in participaciones
        ],
    )


@router.get("/participations/{participacion_id}", response_model=ParticipacionOut)
def consultar_participacion(
    participacion_id: int, db: Session = Depends(get_db)
) -> ParticipacionOut:
    return ParticipacionOut.model_validate(
        participacion_service.obtener_participacion(db, participacion_id)
    )


@router.patch("/participations/{participacion_id}", response_model=ParticipacionOut)
def corregir_participacion(
    participacion_id: int,
    datos: ParticipacionRhUpdateIn,
    cuenta_rh: CuentaAcceso = Depends(require_rh),
    db: Session = Depends(get_db),
) -> ParticipacionOut:
    """Corrección administrativa: auditar en la misma transacción (§25)."""
    participacion = participacion_service.obtener_participacion(db, participacion_id)
    return ParticipacionOut.model_validate(
        participacion_service.corregir_participacion_rh(
            db, participacion=participacion, datos=datos, cuenta_rh=cuenta_rh
        )
    )
