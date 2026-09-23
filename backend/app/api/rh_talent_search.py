"""Router RH: búsqueda manual de talento (PRD §13.1, Especificación §26)
e interpretación con lenguaje natural (PRD §13.3, Especificación §27).

Exclusivo de RH. La búsqueda termina en un filtro backend estructurado:
el cliente envía criterios validados y el backend decide quién cumple.
No existe score global, ranking corporativo ni etiquetas de "mejor
empleado"/"top talento" (PRD §5, §13.2).

La interpretación NO ejecuta la búsqueda: devuelve criterios estructurados
que RH revisa/modifica y ejecuta después vía el servicio manual (§27).
La IA solo interpreta intención (PRD §17.3): jamás selecciona empleados.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_rh
from app.core.db import get_db
from app.models.cuenta_acceso import CuentaAcceso
from app.schemas.interpretacion_busqueda import InterpretacionIn, InterpretacionOut
from app.schemas.talent_search import BusquedaManualIn, BusquedaManualOut
from app.services.ai.ai_orchestrator import construir_orchestrator
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


@router.post("/interpret", response_model=InterpretacionOut)
def interpretar_busqueda(
    datos: InterpretacionIn,
    cuenta_rh: CuentaAcceso = Depends(require_rh),
) -> InterpretacionOut:
    """Interpreta el texto libre de RH como criterios estructurados (§27).

    - NO ejecuta la búsqueda: RH revisa/modifica los criterios y los envía
      después a ``POST /rh/talent-search/manual`` (flujo §27).
    - NO acepta empleados ni IDs como entrada de la interpretación.
    - Groq primario; si falla, Gemini; si ambos fallan, error controlado.
    - Sin proveedores configurados (claves opcionales) responde 502 con
      mensaje claro: nunca se inventa una interpretación.
    """
    _ = cuenta_rh
    return construir_orchestrator().interpretar_busqueda(datos.query_text)

