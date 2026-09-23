"""Router RH: búsqueda manual de talento (PRD §13.1, Especificación §26).

Exclusivo de RH. La búsqueda termina en un filtro backend estructurado:
el cliente envía criterios validados y el backend decide quién cumple.
No existe score global, ranking corporativo ni etiquetas de "mejor
empleado"/"top talento" (PRD §5, §13.2).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_rh
from app.core.db import get_db
from app.models.cuenta_acceso import CuentaAcceso
from app.schemas.talent_search import BusquedaManualIn, BusquedaManualOut
from app.services.talent_search_service import TalentSearchService

router = APIRouter(
    prefix="/rh/talent-search",
    tags=["rh-talent-search"],
    dependencies=[Depends(require_rh)],
)


@router.post("/manual", response_model=BusquedaManualOut)
def busqueda_manual(
    criterios: BusquedaManualIn,
    cuenta_rh: CuentaAcceso = Depends(require_rh),
    db: Session = Depends(get_db),
) -> BusquedaManualOut:
    """Búsqueda manual: AND entre criterios, solo empleados activos.

    ``INSUFFICIENT_DATA`` no satisface ningún ``min_level`` numérico.
    Resultados ordenados informativamente por promedio de las competencias
    seleccionadas (desc) y, en empate, nombre ascendente y después id
    ascendente (PRD §13.2). Nada se persiste.
    """
    _ = cuenta_rh
    return TalentSearchService(db).search_manual(criterios)
