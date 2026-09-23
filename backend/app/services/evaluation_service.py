"""EvaluationService: generación y lectura de evaluaciones históricas (Fase 6).

Especificación Técnica v1.5 §21–§24 y PRD v1.3 §16:
- Generación atómica en UNA transacción (§23): periodo actual → empleados
  activos → CompetencyEngine → snapshot → 9-Box → INSERT → commit. Si
  cualquier paso falla: rollback completo, cero evaluaciones parciales.
- Concurrencia (§23): ``pg_advisory_xact_lock`` por periodo (alcance de
  transacción) + ``UNIQUE(empleado_id, periodo)`` + captura explícita de
  ``IntegrityError`` ⇒ 409. NO se depende solo del pre-check.
- La consulta histórica NUNCA recalcula competencias (§21): devuelve
  exclusivamente los valores capturados al momento de generar.
- Inmutabilidad (§24): no existen operaciones de modificación ni borrado;
  el trigger PostgreSQL de Fase 2 (trg_evaluaciones_inmutable) es la
  última capa de defensa.
- El 9-Box histórico se deriva con el servicio PURO ``nine_box`` (§20):
  prohibido duplicar su lógica aquí.
"""

from fastapi import HTTPException, status
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.fechas import periodo_actual
from app.models.cuenta_acceso import CuentaAcceso
from app.models.empleado import Empleado
from app.models.evaluacion import Evaluacion
from app.schemas.evaluacion import (
    CompetenciaHistoricaDTO,
    EvaluacionEmpleadoOut,
    EvaluacionOut,
    GeneracionEvaluacionesOut,
    NineBoxDTO,
)
from app.schemas.resultado_actual import (
    ClaveCompetencia,
    ResultadoActualDTO,
)
from app.services.competency_engine import CompetencyEngine
from app.services.nine_box import calcular_nine_box, etiqueta_eje

MAX_POR_PAGINA = 100
POR_PAGINA_DEFECTO = 20

MENSAJE_CONFLICTO = "El periodo {periodo} ya cuenta con evaluaciones generadas."


def _clave_advisory(periodo: str) -> int:
    """Clave BIGINT determinista del advisory lock para un periodo YYYY-QN.

    ``anio * 4 + trimestre`` es inyectivo y estable; documentado en
    DECISIONES_TECNICAS.md (Fase 6). El lock es de alcance transaccional:
    se libera solo con COMMIT/ROLLBACK.
    """
    anio, _, trimestre = periodo.partition("-Q")
    return int(anio) * 4 + int(trimestre)


# ---------------------------------------------------------------------------
# Construcción del snapshot (solo al GENERAR: único punto que calcula)
# ---------------------------------------------------------------------------


def _construir_evaluacion(
    *,
    empleado_id: int,
    periodo: str,
    cuenta_rh_id: int,
    resultado: ResultadoActualDTO,
    nine_box: NineBoxDTO,
) -> Evaluacion:
    """Fotografía histórica de un ResultadoActual (§21, PRD §16)."""
    columnas: dict[str, object] = {
        "empleado_id": empleado_id,  # nunca desde el cliente (§32)
        "periodo": periodo,
        "generado_por_cuenta_id": cuenta_rh_id,
        "performance_axis": nine_box.performance_axis,
        "potential_axis": nine_box.potential_axis,
        "box_code": nine_box.box_code,
    }
    for competencia in resultado.competencias:
        prefijo = competencia.clave.value
        # DI ⇒ nivel NULL + status INSUFFICIENT_DATA (§14); jamás nivel 0.
        columnas[f"{prefijo}_nivel"] = competencia.nivel
        columnas[f"{prefijo}_status"] = competencia.estado.value
    return Evaluacion(**columnas)


def generar_evaluaciones(
    db: Session, *, cuenta_rh: CuentaAcceso
) -> GeneracionEvaluacionesOut:
    """Genera las evaluaciones oficiales del periodo vigente (§23, PRD §16.2).

    Solo RH (exigido por el router). Solo empleados activos. Atómica: si un
    empleado falla se hace rollback total. Conflicto (409) si el periodo ya
    fue generado. Sin empleados activos ⇒ respuesta coherente con cero
    evaluaciones (no se inventa nada).
    """
    periodo = periodo_actual()

    # Concurrencia (§23): serializa generaciones del mismo periodo. La
    # segunda ejecución espera aquí, y al reanudar su pre-check ya ve las
    # filas confirmadas de la primera.
    db.execute(
        text("SELECT pg_advisory_xact_lock(:clave)"),
        {"clave": _clave_advisory(periodo)},
    )

    existentes = (
        db.scalar(
            select(func.count())
            .select_from(Evaluacion)
            .where(Evaluacion.periodo == periodo)
        )
        or 0
    )
    if existentes:
        db.rollback()  # libera el advisory lock
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=MENSAJE_CONFLICTO.format(periodo=periodo),
        )

    empleados = db.scalars(
        select(Empleado).where(Empleado.activo.is_(True)).order_by(Empleado.id)
    ).all()
    if not empleados:
        db.rollback()
        return GeneracionEvaluacionesOut(periodo=periodo, total_generadas=0, items=[])

    motor = CompetencyEngine(db)
    evaluaciones: list[Evaluacion] = []
    try:
        for empleado in empleados:
            resultado = motor.calculate(empleado.id)
            nine_box = calcular_nine_box(resultado.competencias)
            evaluaciones.append(
                _construir_evaluacion(
                    empleado_id=empleado.id,
                    periodo=periodo,
                    cuenta_rh_id=cuenta_rh.id,
                    resultado=resultado,
                    nine_box=nine_box,
                )
            )
        db.add_all(evaluaciones)
        db.flush()  # fuerza CHECK/UNIQUE aquí, aún dentro de la transacción
        db.commit()
    except IntegrityError:
        # Defensa final si el pre-check fue vencido: UNIQUE(empleado_id,
        # periodo) ⇒ conflicto, sin dejar evaluaciones parciales.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=MENSAJE_CONFLICTO.format(periodo=periodo),
        ) from None
    except Exception:
        # Fallo a mitad de generación: rollback TOTAL, cero parciales.
        db.rollback()
        raise

    for evaluacion in evaluaciones:
        db.refresh(evaluacion)  # generado_en tiene server_default
    return GeneracionEvaluacionesOut(
        periodo=periodo,
        total_generadas=len(evaluaciones),
        items=[a_evaluacion_out(e) for e in evaluaciones],
    )


# ---------------------------------------------------------------------------
# Lectura del histórico (read-only: NUNCA recalcula, §21/§24)
# ---------------------------------------------------------------------------


def _competencias_historicas(evaluacion: Evaluacion) -> list[CompetenciaHistoricaDTO]:
    return [
        CompetenciaHistoricaDTO(
            clave=clave.value,
            nivel=getattr(evaluacion, f"{clave.value}_nivel"),
            status=getattr(evaluacion, f"{clave.value}_status"),
        )
        for clave in ClaveCompetencia
    ]


def _nine_box_historico(evaluacion: Evaluacion) -> NineBoxDTO:
    """Ejes/celda GUARDADOS; solo las etiquetas de presentación se derivan
    deterministamente del eje almacenado (nunca se recalculan niveles)."""
    performance = evaluacion.performance_axis
    potential = evaluacion.potential_axis
    return NineBoxDTO(
        performance_axis=performance,
        potential_axis=potential,
        box_code=evaluacion.box_code,
        etiqueta_performance=etiqueta_eje(performance),
        etiqueta_potencial=etiqueta_eje(potential),
    )


def a_evaluacion_out(evaluacion: Evaluacion) -> EvaluacionOut:
    """Evaluación histórica COMPLETA para RH (incluye 9-Box, PRD §10)."""
    return EvaluacionOut(
        id=evaluacion.id,
        empleado_id=evaluacion.empleado_id,
        periodo=evaluacion.periodo,
        competencias=_competencias_historicas(evaluacion),
        generado_en=evaluacion.generado_en,
        generado_por_cuenta_id=evaluacion.generado_por_cuenta_id,
        nine_box=_nine_box_historico(evaluacion),
    )


def a_evaluacion_empleado_out(evaluacion: Evaluacion) -> EvaluacionEmpleadoOut:
    """Evaluación histórica propia del Empleado: SIN ejes ni 9-Box (PRD §21)."""
    return EvaluacionEmpleadoOut(
        id=evaluacion.id,
        empleado_id=evaluacion.empleado_id,
        periodo=evaluacion.periodo,
        competencias=_competencias_historicas(evaluacion),
        generado_en=evaluacion.generado_en,
        generado_por_cuenta_id=evaluacion.generado_por_cuenta_id,
    )


def obtener_evaluacion(db: Session, evaluacion_id: int) -> Evaluacion:
    evaluacion = db.get(Evaluacion, evaluacion_id)
    if evaluacion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluación no encontrada.",
        )
    return evaluacion


def listar_evaluaciones(
    db: Session,
    *,
    empleado_id: int | None = None,
    periodo: str | None = None,
    pagina: int = 1,
    por_pagina: int = POR_PAGINA_DEFECTO,
) -> tuple[list[Evaluacion], int]:
    """Lista paginada read-only del histórico (filtros opcionales)."""
    por_pagina = min(max(por_pagina, 1), MAX_POR_PAGINA)
    pagina = max(pagina, 1)

    condiciones = []
    if empleado_id is not None:
        condiciones.append(Evaluacion.empleado_id == empleado_id)
    if periodo is not None:
        condiciones.append(Evaluacion.periodo == periodo)

    consulta_total = select(func.count()).select_from(Evaluacion)
    consulta = select(Evaluacion)
    for condicion in condiciones:
        consulta_total = consulta_total.where(condicion)
        consulta = consulta.where(condicion)

    total = db.scalar(consulta_total)
    evaluaciones = db.scalars(
        consulta.order_by(
            Evaluacion.periodo.desc(), Evaluacion.empleado_id.asc(), Evaluacion.id.asc()
        )
        .offset((pagina - 1) * por_pagina)
        .limit(por_pagina)
    ).all()
    return list(evaluaciones), int(total or 0)


