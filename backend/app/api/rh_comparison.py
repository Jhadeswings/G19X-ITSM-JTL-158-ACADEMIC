"""Router RH: comparación de empleados (PRD v1.3 §20.5).

Exclusivo de RH (401 sin token, 403 Empleado). Vista lateral DERIVADA:
muestra las cinco competencias actuales y la experiencia como contexto;
NO muestra 9-Box, NO declara ganador, NO produce ranking ni score global
y NO llama a IA. El cliente solo envía IDs: el backend resuelve todos
los datos desde el estado actual.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_rh
from app.core.db import get_db
from app.models.cuenta_acceso import CuentaAcceso
from app.schemas.comparacion import ComparacionIn, ComparacionOut
from app.services.comparison_service import ComparisonService

router = APIRouter(
    prefix="/rh/employees/compare",
    tags=["rh-comparacion"],
    dependencies=[Depends(require_rh)],
)


@router.post("", response_model=ComparacionOut)
def comparar_empleados(
    datos: ComparacionIn,
    cuenta_rh: CuentaAcceso = Depends(require_rh),
    db: Session = Depends(get_db),
) -> ComparacionOut:
    """Compara 2 o más empleados activos (PRD §20.5).

    - Contrato estricto: solo ``employee_ids`` (mínimo 2, enteros
      positivos, sin duplicados); campos adicionales ⇒ 422.
    - ID inexistente ⇒ 404; empleado inactivo ⇒ 422 (nunca exclusión
      silenciosa).
    - ``items`` conserva el orden de ``employee_ids`` (neutral,
      determinista, sin clasificación implícita).
    - Cinco competencias + experiencia como contexto; sin 9-Box, sin
      ganador, sin score, sin recomendación automática.
    """
    _ = cuenta_rh
    return ComparisonService(db).compare(datos.employee_ids)
