"""Router Empleado: búsqueda obligatoria y creación de proyectos (Fase 4A).

Todo protegido con ``require_empleado``. Flujo del PRD §11.1:

    Buscar proyecto → Seleccionar existente / revisar aproximados →
    Crear nuevo si no existe → (Registrar participación: Fase 4B)

La coincidencia aproximada es una advertencia informativa: no impide la
creación ni crea ninguna relación (§8).
"""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import empleado_id_propio, require_empleado
from app.core.db import get_db
from app.models.cuenta_acceso import CuentaAcceso
from app.schemas.proyecto import (
    ProyectoCreateIn,
    ProyectoOut,
    ProyectoPageOut,
    ResultadoBusquedaOut,
)
from app.services import proyecto_service

router = APIRouter(
    prefix="/me/projects", tags=["me-proyectos"], dependencies=[Depends(require_empleado)]
)


@router.get("", response_model=ProyectoPageOut)
def listar_mis_proyectos(
    pagina: int = Query(1, ge=1),
    por_pagina: int = Query(20, ge=1, le=100),
    cuenta: CuentaAcceso = Depends(require_empleado),
    db: Session = Depends(get_db),
) -> ProyectoPageOut:
    """Listado paginado de los proyectos del Empleado autenticado (ET §31).

    Es el listado que el documento contempla para orientar sobre proyectos
    desde "Inicio" (PRD §21.1) y reutiliza el mismo esquema de página del
    catálogo (`ProyectoPageOut`) y los mismos límites de paginación.

    El ``empleado_id`` se deriva SIEMPRE de la cuenta/token (§32): el endpoint
    no acepta identificadores en query, body ni path, y una cuenta RH recibe
    403 por el `require_empleado` del router.

    Solo lectura: no crea, no modifica y no audita nada.
    """
    proyectos, total = proyecto_service.listar_proyectos_propio_empleado(
        db,
        empleado_id=empleado_id_propio(cuenta),
        pagina=pagina,
        por_pagina=por_pagina,
    )
    return ProyectoPageOut(
        total=total,
        pagina=pagina,
        por_pagina=por_pagina,
        items=[ProyectoOut.model_validate(proyecto) for proyecto in proyectos],
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
