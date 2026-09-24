"""Router RH: brechas por competencia (PRD §15, §19).

Exclusivo de RH. Una competencia por consulta sobre el resultado actual
vigente (sin evaluaciones históricas): conteos y porcentajes de niveles
1–2 / 3–5 con ``Datos insuficientes`` por separado. Vista derivada sin
score, sin ranking y sin persistencia; los porcentajes no se presentan
automáticamente como señal de alarma (PRD §15).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.api.deps import require_rh
from app.core.db import get_db
from app.models.cuenta_acceso import CuentaAcceso
from app.schemas.brecha import BrechaOut
from app.schemas.resultado_actual import ClaveCompetencia
from app.services.gap_service import GapService

router = APIRouter(
    prefix="/rh/gaps",
    tags=["rh-gaps"],
    dependencies=[Depends(require_rh)],
)


@router.get("", response_model=BrechaOut)
def obtener_brecha(
    request: Request,
    competency_code: ClaveCompetencia = Query(
        ..., description="Competencia cerrada (una por consulta, PRD §15)."
    ),
    cuenta_rh: CuentaAcceso = Depends(require_rh),
    db: Session = Depends(get_db),
) -> BrechaOut:
    """Distribución de niveles de UNA competencia (§15, solo activos).

    - ``competency_code`` se valida contra el catálogo cerrado de las
      cinco competencias (código desconocido ⇒ 422) y debe aparecer UNA
      sola vez (PRD §15: una competencia por consulta).
    - ``datos_insuficientes`` va POR SEPARADO: no entra en los grupos
      1–2 / 3–5 ni en el denominador de los porcentajes.
    - Con 0 evaluables los porcentajes son ``0.00`` (sin alarma).
    """
    _ = cuenta_rh
    if len(request.query_params.getlist("competency_code")) != 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Debe consultar exactamente una competencia a la vez.",
        )
    return GapService(db).obtener_brecha(competency_code)