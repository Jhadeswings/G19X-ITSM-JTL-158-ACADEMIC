"""Router RH: Atención requerida (PRD §19.1, Especificación §30).

Exclusivo de RH. Vista DERIVADA y global: no existe tabla ``Alert``, la
consulta no modifica datos ni genera persistencia/auditoría. El cliente
NO decide quién aparece: las reglas (perfil incompleto / sin
participación en 90 días, America/Mexico_City) se evalúan en backend
para todos los empleados activos. Motivos neutrales estructurados
(orientación operativa, PRD §23).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_rh
from app.core.db import get_db
from app.models.cuenta_acceso import CuentaAcceso
from app.schemas.atencion import AtencionRequeridaOut
from app.services.attention_service import AttentionService

router = APIRouter(
    prefix="/rh/attention-required",
    tags=["rh-atencion-requerida"],
    dependencies=[Depends(require_rh)],
)


@router.get("", response_model=AtencionRequeridaOut)
def atencion_requerida(
    cuenta_rh: CuentaAcceso = Depends(require_rh),
    db: Session = Depends(get_db),
) -> AtencionRequeridaOut:
    """Empleados activos con perfil incompleto o sin participación en los
    últimos 90 días (§30, ``fecha_registro`` en America/Mexico_City)."""
    _ = cuenta_rh
    return AttentionService(db).get_required_attention()