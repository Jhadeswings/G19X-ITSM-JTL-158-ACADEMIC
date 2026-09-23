"""Router Empleado: búsqueda obligatoria y creación de proyectos (Fase 4A).

Todo protegido con ``require_empleado``. Flujo del PRD §11.1:

    Buscar proyecto → Seleccionar existente / revisar aproximados →
    Crear nuevo si no existe → (Registrar participación: Fase 4B)

La coincidencia aproximada es una advertencia informativa: no impide la
creación ni crea ninguna relación (§8).
"""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require_empleado
from app.core.db import get_db
from app.models.cuenta_acceso import CuentaAcceso
from app.schemas.proyecto import (
    ProyectoCreateIn,
    ProyectoOut,
    ResultadoBusquedaOut,
)
from app.services import proyecto_service

router = APIRouter(
    prefix="/me/projects", tags=["me-proyectos"], dependencies=[Depends(require_empleado)]
)


@router.get("/search", response_model=ResultadoBusquedaOut)
def buscar_proyectos(
    nombre: str = Query(..., min_length=1),
    cuenta: CuentaAcceso = Depends(require_empleado),
    db: Session = Depends(get_db),
) -> ResultadoBusquedaOut:
    """Búsqueda obligatoria antes de crear un proyecto.

    Coincidencia exacta por ``nombre_normalizado`` identificada como
    proyecto existente; si no hay exacta, sugerencias pg_trgm (≤5, >0.30).
    """
    _ = cuenta
    return proyecto_service.buscar_proyectos(db, nombre)


@router.post("", response_model=ProyectoOut, status_code=status.HTTP_201_CREATED)
def crear_proyecto(
    datos: ProyectoCreateIn,
    cuenta: CuentaAcceso = Depends(require_empleado),
    db: Session = Depends(get_db),
) -> ProyectoOut:
    """Crea un proyecto nuevo del catálogo compartido.

    Siempre inicia en EN_PROCESO. Rechaza (409) únicamente duplicados
    exactos tras la normalización (PRD §11.2); las coincidencias
    aproximadas NO impiden la creación.
    """
    _ = cuenta
    return ProyectoOut.model_validate(
        proyecto_service.crear_proyecto_empleado(db, datos)
    )
