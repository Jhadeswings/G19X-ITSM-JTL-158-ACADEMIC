"""Router RH: administración de proyectos EXISTENTES (Fase 4A).

Todo protegido con ``require_rh``. NO existe endpoint de creación: RH
administra proyectos existentes pero no crea proyectos desde cero
(PRD §11.1).
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_rh
from app.core.db import get_db
from app.schemas.proyecto import ProyectoOut, ProyectoPageOut, ProyectoUpdateIn
from app.services import proyecto_service

router = APIRouter(
    prefix="/rh/projects", tags=["rh-proyectos"], dependencies=[Depends(require_rh)]
)


@router.get("", response_model=ProyectoPageOut)
def listar_proyectos(
    pagina: int = Query(1, ge=1),
    por_pagina: int = Query(20, ge=1, le=100),
    estado: str | None = Query(None),
    area: str | None = Query(None),
    db: Session = Depends(get_db),
) -> ProyectoPageOut:
    proyectos, total = proyecto_service.listar_proyectos(
        db, pagina=pagina, por_pagina=por_pagina, estado=estado, area=area
    )
    return ProyectoPageOut(
        total=total,
        pagina=pagina,
        por_pagina=por_pagina,
        items=[ProyectoOut.model_validate(p) for p in proyectos],
    )


@router.get("/{proyecto_id}", response_model=ProyectoOut)
def consultar_proyecto(proyecto_id: int, db: Session = Depends(get_db)) -> ProyectoOut:
    return ProyectoOut.model_validate(
        proyecto_service.obtener_proyecto(db, proyecto_id)
    )


@router.patch("/{proyecto_id}", response_model=ProyectoOut)
def actualizar_proyecto(
    proyecto_id: int,
    datos: ProyectoUpdateIn,
    db: Session = Depends(get_db),
) -> ProyectoOut:
    """Edición administrativa de un proyecto existente (nombre/área/cliente/estado)."""
    proyecto = proyecto_service.obtener_proyecto(db, proyecto_id)
    return ProyectoOut.model_validate(
        proyecto_service.actualizar_proyecto_rh(db, proyecto, datos)
    )
