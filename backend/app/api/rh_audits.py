"""Router RH: consulta de la auditoría de correcciones (Tarea C).

Exclusivo de RH (``require_rh``): lectura paginada de los registros ya
existentes en ``AuditoriaModificacion`` (ET §25, PRD §22). Este endpoint
SOLO consulta: no modifica datos y NO genera un registro de auditoría —la
auditoría sigue siendo exclusiva de las correcciones administrativas y aquí
no se amplía qué operaciones la generan—.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_rh
from app.core.db import get_db
from app.schemas.auditoria import AuditoriaPageOut
from app.services import auditoria_service

router = APIRouter(
    prefix="/rh/audits", tags=["rh-auditorias"], dependencies=[Depends(require_rh)]
)


@router.get("", response_model=AuditoriaPageOut)
def listar_auditorias(
    pagina: int = Query(1, ge=1),
    por_pagina: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> AuditoriaPageOut:
    """Auditorías registradas, paginadas y en orden determinista (§25).

    Mismos límites de paginación que el resto de listados RH
    (``pagina >= 1``, ``por_pagina`` 1..100, default 20). La autorización
    la aplica ``require_rh``: sin token 401 y rol EMPLEADO 403.
    """
    registros, total = auditoria_service.listar_auditorias(
        db, pagina=pagina, por_pagina=por_pagina
    )
    return AuditoriaPageOut(
        total=total,
        pagina=pagina,
        por_pagina=por_pagina,
        items=[auditoria_service.a_auditoria_out(r) for r in registros],
    )