"""Router Empleado: recomendación de desarrollo con IA (PRD §17.2, §21.2).

Exclusivo de Empleado (RH no necesita acceso a este bloque). La vista
"Mi progreso" consumirá: datos actuales + fortalezas + oportunidades
(bloque del sistema) y recomendación IA (bloque separado, presentado
como sugerencia, Style Guide §17.2/§3.6).

- ``empleado_id`` SIEMPRE deriva del token (§32): el endpoint NO acepta
  ``employee_id``, niveles, fortalezas ni texto del cliente.
- La IA nunca calcula competencias ni decide categorías: solo sugiere.
- Sin persistencia: cada consulta deriva el resultado actual y pide una
  recomendación nueva al proveedor.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import empleado_id_propio, require_empleado
from app.core.db import get_db
from app.models.cuenta_acceso import CuentaAcceso
from app.schemas.recomendacion_ia import RecomendacionIAOut
from app.services.ai.ai_orchestrator import construir_orchestrator
from app.services.recomendacion_service import RecommendationService

router = APIRouter(
    prefix="/me/progress",
    tags=["me-progreso"],
    dependencies=[Depends(require_empleado)],
)


@router.get("/recommendation", response_model=RecomendacionIAOut)
def mi_recomendacion(
    cuenta: CuentaAcceso = Depends(require_empleado),
    db: Session = Depends(get_db),
) -> RecomendacionIAOut:
    """Resultado actual + recomendación de desarrollo sugerida por IA.

    - Bloque ``resultado_actual``: competencias (DI preservado),
      experiencia como contexto, fortalezas y oportunidades por reglas.
    - Bloque ``recomendacion_ia``: sugerencia breve + acciones, con
      ``origen: "IA"`` y proveedor. Nunca resultado oficial.
    - Proveedores no configurados o ambos caídos ⇒ 200 con el resultado
      del engine y ``recomendacion_ia: null``: la IA es secundaria
      (PRD §17) y su fallo no elimina el resultado oficial.
    """
    return RecommendationService(db).obtener(
        empleado_id_propio(cuenta), construir_orchestrator()
    )
