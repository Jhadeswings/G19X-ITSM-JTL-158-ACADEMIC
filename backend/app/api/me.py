"""Endpoint de identidad (Fase 3).

GET /api/v1/me es el endpoint protegido real de esta fase: devuelve la
identidad del usuario autenticado. El ``cuenta_id`` y el ``empleado_id``
provienen SIEMPRE del token validado en backend, nunca del cliente (§32).

``GET /api/v1/me/result`` (ET §31) expone el ResultadoActual del propio
Empleado autenticado SIN capa IA: reutiliza ``resultado_actual_service``
(mismo camino que el bloque de RH) y por lo tanto ``CompetencyEngine`` como
único dueño de las fórmulas (§13). Sin persistencia (§18), sin Groq/Gemini
y sin aceptar ningún identificador del cliente.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import empleado_id_propio, get_current_user, require_empleado
from app.core.db import get_db
from app.models.cuenta_acceso import CuentaAcceso
from app.models.empleado import Empleado
from app.schemas.auth import MeOut
from app.schemas.resultado_actual import ResultadoActualDTO
from app.services import resultado_actual_service

router = APIRouter(prefix="/me", tags=["me"])


@router.get("", response_model=MeOut)
def quien_soy(
    cuenta: CuentaAcceso = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MeOut:
    """Identidad de la cuenta autenticada.

    Expone además ``puesto`` y ``area`` del empleado autenticado (PRD §21.6
    "Mi cuenta"): son datos de SOLO LECTURA que ya pertenecen a ``Empleado``
    (ET §5). No se derivan ni se completan aquí, y este DTO no expone ninguna
    vía para modificarlos (los datos laborales los administra RH).

    Se leen SIEMPRE del empleado ligado a la cuenta autenticada (``sub`` del
    token, §32): el endpoint no acepta ``empleado_id`` del cliente. Si la cuenta
    no tiene empleado (p. ej. RH), los tres datos del empleado salen ``null``.
    """
    empleado_nombre = None
    puesto = None
    area = None
    if cuenta.empleado_id is not None:
        empleado = db.get(Empleado, cuenta.empleado_id)
        if empleado:
            empleado_nombre = empleado.nombre
            puesto = empleado.puesto
            area = empleado.area
    return MeOut(
        cuenta_id=cuenta.id,
        email=cuenta.email,
        rol=cuenta.rol,
        empleado_id=cuenta.empleado_id,
        empleado_nombre=empleado_nombre,
        puesto=puesto,
        area=area,
        must_change_password=cuenta.must_change_password,
    )


@router.get("/result", response_model=ResultadoActualDTO)
def mi_resultado_actual(
    cuenta: CuentaAcceso = Depends(require_empleado),
    db: Session = Depends(get_db),
) -> ResultadoActualDTO:
    """Resultado actual oficial del Empleado autenticado (ET §31).

    Contrato propio del Empleado, sin contraparte en RH: la ruta representa
    exclusivamente "el resultado actual de quien autentica". El
    ``empleado_id`` deriva SIEMPRE de la cuenta/token (§32): el endpoint no
    acepta ``empleado_id`` en query, body ni path, y una cuenta RH recibe 403.

    Reutiliza ``resultado_actual_service`` —el mismo servicio del bloque de
    RH—, de modo que el cálculo vive únicamente en ``CompetencyEngine`` (§13)
    y ``INSUFFICIENT_DATA`` se preserva con ``nivel`` en ``None`` (§14).
    Derivado y en memoria (§18): sin tabla, sin snapshot, sin persistencia y
    sin participación de IA: aquí no participan Groq, Gemini, LangChain ni
    ``AIOrchestrator`` — la sugerencia de desarrollo sigue viviendo en
    ``GET /me/progress/recommendation`` con su contrato intacto.
    """
    return resultado_actual_service.obtener_resultado_actual(
        db, empleado_id_propio(cuenta)
    )
