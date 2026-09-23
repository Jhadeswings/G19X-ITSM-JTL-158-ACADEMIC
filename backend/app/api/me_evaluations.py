"""Router Empleado: evaluaciones oficiales propias (Fase 6).

Protegido con ``require_empleado`` + ownership estricto (§32): el
``empleado_id`` SIEMPRE se deriva de la cuenta autenticada, nunca del
cliente. La respuesta usa ``EvaluacionEmpleadoOut``: SIN ejes ni 9-Box
(PRD §21: "No muestra ejes ni 9-Box"; el 9-Box es exclusivo de RH, §10).

Solo existe lectura (§24): no hay POST, PATCH ni DELETE para /me.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import empleado_id_propio, require_empleado
from app.core.db import get_db
from app.models.cuenta_acceso import CuentaAcceso
from app.schemas.evaluacion import EvaluacionEmpleadoPageOut
from app.services import evaluation_service

router = APIRouter(
    prefix="/me/evaluations",
    tags=["me-evaluaciones"],
    dependencies=[Depends(require_empleado)],
)


@router.get("", response_model=EvaluacionEmpleadoPageOut)
def listar_evaluaciones_propias(
    pagina: int = Query(1, ge=1),
    por_pagina: int = Query(20, ge=1, le=100),
    cuenta: CuentaAcceso = Depends(require_empleado),
    db: Session = Depends(get_db),
) -> EvaluacionEmpleadoPageOut:
    """Historial propio paginado, sin ejes ni 9-Box, nunca recalculado."""
    evaluaciones, total = evaluation_service.listar_evaluaciones(
        db,
        empleado_id=empleado_id_propio(cuenta),
        pagina=pagina,
        por_pagina=por_pagina,
    )
    return EvaluacionEmpleadoPageOut(
        total=total,
        pagina=pagina,
        por_pagina=por_pagina,
        items=[evaluation_service.a_evaluacion_empleado_out(e) for e in evaluaciones],
    )
