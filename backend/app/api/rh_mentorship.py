"""Router RH: mentoría (PRD §14, Especificación Técnica §29).

Exclusivo de RH. La sugerencia de mentor es una consulta DERIVADA y
determinista: se calcula sobre el ResultadoActual vigente, no usa IA,
no usa evaluaciones históricas y no persiste nada. La justificación se
expresa siempre como ``Criterio del sistema`` (PRD §14.3): jamás como
"mejor empleado", "top mentor" ni "mejor talento".
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_rh
from app.core.db import get_db
from app.models.cuenta_acceso import CuentaAcceso
from app.schemas.mentoria import SugerenciaMentoriaIn, SugerenciaMentoriaOut
from app.services.empleado_service import obtener_empleado
from app.services.mentorship_service import MentorshipService

router = APIRouter(
    prefix="/rh/mentorship",
    tags=["rh-mentorship"],
    dependencies=[Depends(require_rh)],
)


@router.post("/suggest", response_model=SugerenciaMentoriaOut)
def sugerir_mentor(
    datos: SugerenciaMentoriaIn,
    cuenta_rh: CuentaAcceso = Depends(require_rh),
    db: Session = Depends(get_db),
) -> SugerenciaMentoriaOut:
    """Sugiere mentor para un receptor en una competencia (§29).

    - 404 si el receptor no existe (sin revelar más información).
    - El cliente NO puede introducir datos del mentor ni niveles: el
      backend calcula todo a partir de reglas (§29.2–§29.3).
    - ``elegible=false`` cuando el receptor tiene nivel 5, Datos
      insuficientes o está inactivo; ``mentor=null`` cuando nadie cumple.
    """
    _ = cuenta_rh
    obtener_empleado(db, datos.receiver_id)  # 404 si no existe
    return MentorshipService(db).suggest(datos.receiver_id, datos.competency_code)