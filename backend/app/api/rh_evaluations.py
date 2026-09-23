"""Router RH: evaluaciones oficiales históricas (Fase 6).

Todo protegido con ``require_rh`` (PRD §16.2, Especificación §23):
- POST /rh/evaluations/generate: generación atómica del periodo vigente.
- GET /rh/evaluations: historial paginado (incluye 9-Box, PRD §10).
- GET /rh/evaluations/{id}: evaluación individual (incluye 9-Box).
- GET /rh/employees/{id}/evaluations: historial de un empleado.

Inmutabilidad (§24): NO existen PATCH ni DELETE. Las lecturas son
read-only y jamás recalculan competencias.
"""

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import require_rh
from app.core.db import get_db
from app.models.cuenta_acceso import CuentaAcceso
from app.schemas.evaluacion import (
    EvaluacionOut,
    EvaluacionPageOut,
    GeneracionEvaluacionesOut,
)
from app.services import evaluation_service
from app.services.empleado_service import obtener_empleado

router = APIRouter(
    prefix="/rh", tags=["rh-evaluaciones"], dependencies=[Depends(require_rh)]
)

# Formato de periodo en query params (§21/§22): validación temprana.
PATRON_PERIODO = r"^[0-9]{4}-Q[1-4]$"


@router.post("/evaluations/generate", response_model=GeneracionEvaluacionesOut)
def generar_evaluaciones(
    cuenta_rh: CuentaAcceso = Depends(require_rh),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Genera las evaluaciones oficiales del periodo vigente (§23).

    - 201 cuando se crearon evaluaciones; 200 coherente si no hay
      empleados activos (no se inventa ninguna evaluación).
    - 409 si el periodo ya fue generado (concurrencia incluida).
    """
    resultado = evaluation_service.generar_evaluaciones(db, cuenta_rh=cuenta_rh)
    codigo = 201 if resultado.total_generadas > 0 else 200
    return JSONResponse(status_code=codigo, content=resultado.model_dump(mode="json"))


@router.get("/evaluations", response_model=EvaluacionPageOut)
def listar_evaluaciones(
    pagina: int = Query(1, ge=1),
    por_pagina: int = Query(20, ge=1, le=100),
    empleado_id: int | None = Query(None),
    periodo: str | None = Query(None, pattern=PATRON_PERIODO),
    db: Session = Depends(get_db),
) -> EvaluacionPageOut:
    """Historial paginado de evaluaciones (con 9-Box, exclusivo RH)."""
    evaluaciones, total = evaluation_service.listar_evaluaciones(
        db,
        empleado_id=empleado_id,
        periodo=periodo,
        pagina=pagina,
        por_pagina=por_pagina,
    )
    return EvaluacionPageOut(
        total=total,
        pagina=pagina,
        por_pagina=por_pagina,
        items=[evaluation_service.a_evaluacion_out(e) for e in evaluaciones],
    )


@router.get("/evaluations/{evaluacion_id}", response_model=EvaluacionOut)
def consultar_evaluacion(
    evaluacion_id: int, db: Session = Depends(get_db)
) -> EvaluacionOut:
    return evaluation_service.a_evaluacion_out(
        evaluation_service.obtener_evaluacion(db, evaluacion_id)
    )


@router.get(
    "/employees/{empleado_id}/evaluations", response_model=EvaluacionPageOut
)
def listar_evaluaciones_empleado(
    empleado_id: int,
    pagina: int = Query(1, ge=1),
    por_pagina: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> EvaluacionPageOut:
    """Historial paginado de las evaluaciones de un empleado (RH)."""
    obtener_empleado(db, empleado_id)  # 404 si el empleado no existe
    evaluaciones, total = evaluation_service.listar_evaluaciones(
        db, empleado_id=empleado_id, pagina=pagina, por_pagina=por_pagina
    )
    return EvaluacionPageOut(
        total=total,
        pagina=pagina,
        por_pagina=por_pagina,
        items=[evaluation_service.a_evaluacion_out(e) for e in evaluaciones],
    )
