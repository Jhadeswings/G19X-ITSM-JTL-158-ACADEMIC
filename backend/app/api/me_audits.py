"""Router Empleado: historial de mis participaciones.

Equivalente del Empleado de ``GET /rh/audits`` (Tarea C; PRD §22, ET §25),
restringido por ownership (ET §32): muestra SOLO los eventos asociados a las
participaciones del empleado autenticado —tanto las correcciones
administrativas que RH le aplicó (``CORRECCION``) como sus propias
modificaciones (``MODIFICACION_EMPLEADO``)—.

Protegido con ``require_empleado``: sin token 401 y cuenta RH 403. El
``empleado_id`` se deriva SIEMPRE de la cuenta autenticada
(``empleado_id_propio``), nunca del cliente. Reutiliza ``AuditoriaPageOut`` /
``AuditoriaOut`` y el mismo ``auditoria_service`` que RH; NO altera la
auditoría completa de RH ni qué operaciones la generan. Solo lectura: aquí no
se crea, edita ni borra nada, y esta consulta tampoco genera auditoría.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import empleado_id_propio, require_empleado
from app.core.db import get_db
from app.models.cuenta_acceso import CuentaAcceso
from app.schemas.auditoria import AuditoriaPageOut
from app.services import auditoria_service

router = APIRouter(
    prefix="/me/audits",
    tags=["me-auditorias"],
    dependencies=[Depends(require_empleado)],
)


@router.get("", response_model=AuditoriaPageOut)
def listar_mis_auditorias(
    pagina: int = Query(1, ge=1),
    por_pagina: int = Query(20, ge=1, le=100),
    cuenta: CuentaAcceso = Depends(require_empleado),
    db: Session = Depends(get_db),
) -> AuditoriaPageOut:
    """Historial de eventos de MIS participaciones, paginado (§25).

    Incluye AMBOS tipos de evento sobre las participaciones propias: las
    correcciones administrativas de RH (``CORRECCION``) y las modificaciones
    del propio Empleado (``MODIFICACION_EMPLEADO``), diferenciadas por
    ``operacion`` en cada item (§9.1 ampliado). Mismos límites de paginación
    que el resto de listados (``pagina >= 1``, ``por_pagina`` 1..100,
    default 20). El filtrado por empleado lo aplica el servidor con un JOIN
    a ``Participacion`` (§32): el cliente no envía ni puede influir en el
    ``empleado_id``, así que nunca ve eventos de participaciones ajenas.
    """
    registros, total = auditoria_service.listar_auditorias_de_participaciones(
        db,
        empleado_id=empleado_id_propio(cuenta),
        pagina=pagina,
        por_pagina=por_pagina,
    )
    return AuditoriaPageOut(
        total=total,
        pagina=pagina,
        por_pagina=por_pagina,
        items=[auditoria_service.a_auditoria_out(r) for r in registros],
    )
