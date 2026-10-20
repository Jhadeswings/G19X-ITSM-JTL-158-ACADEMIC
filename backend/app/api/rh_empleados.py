"""Router RH: gestión de empleados (Fase 4A), resultado actual (Fase 13) y
recomendación de desarrollo (PRD v1.4 §20.2.1, ET v1.6 §31.1).

Todo protegido con ``require_rh``: la autorización se ejecuta en backend.
Un Empleado no puede gestionar empleados (403).

- ``GET /rh/employees/{id}/result`` (ET §31) devuelve el ResultadoActual
  vigente del empleado para el perfil individual de RH (PRD §20.2). Es una
  lectura DERIVADA del estado actual (nunca del histórico, §18) y el cálculo
  vive en ``resultado_actual_service``: aquí no hay fórmulas.
- ``GET /rh/employees/{id}/nine-box`` (ET §20/§31) devuelve el 9-Box vigente
  del empleado. Es un CONTRATO SEPARADO a propósito: ``ResultadoActualDTO`` no
  incluye 9-Box y su lectura histórica tampoco se recalcula.
- ``GET /rh/employees/{id}/recommendation`` (ET §31.1) devuelve la
  sugerencia de desarrollo con IA del empleado indicado, bajo demanda
  explícita de RH. Reutiliza ``RecommendationService``,
  ``AIOrchestrator`` y los DTO existentes sin duplicar lógica; ruta
  separada de ``GET /me/progress/recommendation``, que sigue siendo
  exclusiva del empleado.
"""

import io
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import require_rh
from app.core.db import get_db
from app.models.cuenta_acceso import CuentaAcceso
from app.schemas.empleado import (
    EmpleadoCreateIn,
    EmpleadoOut,
    EmpleadoPageOut,
    EmpleadoUpdateIn,
    EstadoEmpleadoIn,
)
from app.schemas.evaluacion import NineBoxDTO
from app.schemas.recomendacion_ia import RecomendacionIAOut
from app.schemas.resultado_actual import ClaveCompetencia, ResultadoActualDTO
from app.services import (
    empleado_service,
    nine_box_service,
    perfil_pdf_service,
    resultado_actual_service,
)
from app.services.ai.ai_orchestrator import construir_orchestrator
from app.services.recomendacion_service import RecommendationService

router = APIRouter(
    prefix="/rh/employees", tags=["rh-empleados"], dependencies=[Depends(require_rh)]
)
logger = logging.getLogger(__name__)


@router.post("", response_model=EmpleadoOut, status_code=status.HTTP_201_CREATED)
def crear_empleado(
    datos: EmpleadoCreateIn,
    cuenta_rh: CuentaAcceso = Depends(require_rh),
    db: Session = Depends(get_db),
) -> EmpleadoOut:
    """Alta de empleado + CuentaAcceso con credencial temporal (PRD §3.3).

    La credencial temporal nunca se expone en la respuesta.
    """
    _ = cuenta_rh
    empleado = empleado_service.crear_empleado(db, datos)
    return EmpleadoOut.model_validate(empleado)


@router.get("", response_model=EmpleadoPageOut)
def listar_empleados(
    pagina: int = Query(1, ge=1),
    por_pagina: int = Query(20, ge=1, le=100),
    activo: bool | None = Query(None),
    area: str | None = Query(None),
    q: str | None = Query(None, max_length=100),
    competencia: ClaveCompetencia | None = Query(
        None, description="Competencia del catálogo cerrado (DECISIONES §54)."
    ),
    nivel_min: int | None = Query(
        None, ge=1, le=5, description="Nivel mínimo inclusivo (§54 H3-A)."
    ),
    solo_di: bool = Query(
        False, description="Solo empleados con Datos insuficientes (§54 H3-C)."
    ),
    db: Session = Depends(get_db),
) -> EmpleadoPageOut:
    """Lista administrativa paginada de empleados.

    ``q`` busca por nombre/puesto (PRD §20.1, coincidencia parcial en
    backend); ``area`` sigue siendo coincidencia EXACTA normalizada.

    Filtros por competencia y nivel (DECISIONES §54): ``competencia`` +
    ``nivel_min`` (inclusivo) o ``competencia`` + ``solo_di`` (estado DI
    real). Son excluyentes entre sí y dependen de ``competencia`` (422 en
    caso contrario); FastAPI rechaza con 422 una competencia fuera del
    catálogo y un nivel fuera de 1–5. Una ``competencia`` sin criterio de
    nivel/DI no filtra: el listado conserva el comportamiento actual.
    """
    if competencia is None and (nivel_min is not None or solo_di):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "El filtro de nivel o de Datos insuficientes requiere "
                "seleccionar una competencia."
            ),
        )
    if solo_di and nivel_min is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "nivel_min y solo_di son excluyentes: Datos insuficientes "
                "no es un nivel."
            ),
        )
    empleados, total = empleado_service.listar_empleados(
        db,
        pagina=pagina,
        por_pagina=por_pagina,
        activo=activo,
        area=area,
        q=q,
        competencia=competencia,
        nivel_min=nivel_min,
        solo_di=solo_di,
    )
    return EmpleadoPageOut(
        total=total,
        pagina=pagina,
        por_pagina=por_pagina,
        items=[EmpleadoOut.model_validate(e) for e in empleados],
    )


@router.get("/{empleado_id}", response_model=EmpleadoOut)
def consultar_empleado(
    empleado_id: int, db: Session = Depends(get_db)
) -> EmpleadoOut:
    return EmpleadoOut.model_validate(
        empleado_service.obtener_empleado(db, empleado_id)
    )


@router.get("/{empleado_id}/result", response_model=ResultadoActualDTO)
def consultar_resultado_actual(
    empleado_id: int, db: Session = Depends(get_db)
) -> ResultadoActualDTO:
    """Resultado actual vigente de un empleado (RH, ET §31, PRD §20.2).

    - Deriva del estado ACTUAL de la base de datos reutilizando el
      ``CompetencyEngine`` (§13/§18): no consulta el histórico, no se
      persiste nada y no interviene IA.
    - ``INSUFFICIENT_DATA`` se preserva tal cual (``nivel`` nulo, §14).
    - Empleado inexistente ⇒ 404. No se agregan reglas por estado del
      empleado: ni el PRD ni la Especificación las definen para el
      ResultadoActual. El ``empleado_id`` viene de la ruta y el cliente no
      puede enviar niveles, fortalezas ni experiencia.
    """
    return resultado_actual_service.obtener_resultado_actual(db, empleado_id)


@router.get("/{empleado_id}/nine-box", response_model=NineBoxDTO)
def consultar_nine_box_actual(
    empleado_id: int, db: Session = Depends(get_db)
) -> NineBoxDTO:
    """9-Box vigente del empleado para el bloque del perfil RH (ET §20/§31).

    - Ejes y celda DERIVADOS del estado actual, nunca del histórico: la
      lectura del snapshot no se toca (DECISIONES §30).
    - Contrato SEPARADO de ``/result``: ``ResultadoActualDTO`` no incluye
      9-Box y aquí no se modifica.
    - DI en cualquiera de las cinco competencias ⇒ los cinco campos en
      ``null`` (§20.2). Sin IA y sin score global (§20.3).
    - Cero fórmulas aquí: compone ``resultado_actual_service`` y el servicio
      puro ``nine_box`` (§13).
    - Empleado inexistente ⇒ 404 (mismo comportamiento que ``/result``).
    """
    return nine_box_service.obtener_nine_box_actual(db, empleado_id)


@router.get("/{empleado_id}/profile/pdf")
def descargar_perfil_pdf(
    empleado_id: int, db: Session = Depends(get_db)
) -> StreamingResponse:
    """Descarga el informe PDF real del perfil del empleado (DECISIONES §55).

    - Exclusivo RH (``require_rh`` del router): 401 sin token, 403 Empleado,
      404 si el empleado no existe. Mismos permisos que el perfil en
      pantalla (ET §43): no se exporta nada que la interfaz no muestre.
    - Composición de SOLO LECTURA de los servicios existentes (empleado,
      resultado actual, 9-Box vigente, evaluaciones históricas): cero
      fórmulas, sin IA, sin persistencia (no crea evaluaciones ni guarda
      ``ResultadoActual``).
    - El nombre del archivo es ASCII sanitizado, sin correo:
      ``perfil-empleado-{slug}-{fecha}.pdf``.
    - Un fallo de generación (p. ej. el motor de renderizado) responde 500
      con un mensaje genérico: no se expone el detalle interno ni del
      empleado en la respuesta ni en logs.
    - Nada del contenido se registra en logs.
    """
    try:
        contenido, nombre = perfil_pdf_service.generar_pdf_perfil(
            db, empleado_id
        )
    except HTTPException:
        raise
    except Exception:
        logger.warning(
            "No fue posible generar el PDF del perfil (empleado_id=%s)",
            empleado_id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No fue posible generar el PDF del perfil. "
                   "Inténtalo de nuevo.",
        ) from None
    return StreamingResponse(
        io.BytesIO(contenido),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


@router.get("/{empleado_id}/recommendation", response_model=RecomendacionIAOut)
def consultar_recomendacion(
    empleado_id: int, db: Session = Depends(get_db)
) -> RecomendacionIAOut:
    """Sugerencia de desarrollo con IA del empleado indicado (RH, ET §31.1,
    PRD v1.4 §20.2.1).

    - Ruta separada de ``GET /me/progress/recommendation`` (exclusiva del
      empleado): aquí el ``empleado_id`` viene del path y la autorización
      es ``require_rh`` (401 sin token, 403 Empleado).
    - Misma elegibilidad que el perfil RH y ``/result``: sin restricción
      exclusiva por estado activo; inexistente ⇒ 404.
    - Reutiliza ``RecommendationService`` + ``AIOrchestrator`` + DTO
      existentes: el ``empleado_id`` NUNCA se envía al LLM (contexto
      mínimo, PRD §18). IA no disponible ⇒ 200 con
      ``recomendacion_ia: null``. Cero persistencia: sin tabla, sin
      caché, sin historial, sin auditoría.
    """
    return RecommendationService(db).obtener(
        empleado_id, construir_orchestrator()
    )


@router.patch("/{empleado_id}", response_model=EmpleadoOut)
def actualizar_empleado(
    empleado_id: int,
    datos: EmpleadoUpdateIn,
    db: Session = Depends(get_db),
) -> EmpleadoOut:
    """Actualiza datos administrativos permitidos (nombre/puesto/área/ingreso)."""
    empleado = empleado_service.obtener_empleado(db, empleado_id)
    return EmpleadoOut.model_validate(
        empleado_service.actualizar_empleado(db, empleado, datos)
    )


@router.patch("/{empleado_id}/estado", response_model=EmpleadoOut)
def cambiar_estado_empleado(
    empleado_id: int,
    datos: EstadoEmpleadoIn,
    db: Session = Depends(get_db),
) -> EmpleadoOut:
    """Activa/desactiva SOLO el estado del empleado.

    No modifica CuentaAcceso: ambos estados están separados (ver
    DECISIONES_TECNICAS.md).
    """
    empleado = empleado_service.obtener_empleado(db, empleado_id)
    return EmpleadoOut.model_validate(
        empleado_service.cambiar_activo(db, empleado, datos.activo)
    )
