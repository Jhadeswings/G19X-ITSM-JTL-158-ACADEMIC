"""Servicio de participaciones (Fase 4B).

Reglas (Especificación Técnica §9–§10, PRD §12):
- Única por combinación empleado/proyecto (UNIQUE + validación 409).
- Registro inicial: el Empleado captura todos los indicadores;
  ``fecha_registro`` la fija el servidor con la fecha de negocio
  (America/Mexico_City); ``empleado_id`` siempre deriva de la cuenta
  autenticada (§32, anti-IDOR).
- Edición del Empleado tras el alta: SOLO rol/entregables/horas; los
  indicadores objetivos quedan bloqueados (el rechazo ocurre en el
  esquema con extra="forbid" → 422).
- RH corrige campos administrativos (excepto empleado_id, proyecto_id y
  fecha_registro) y TODA corrección genera AuditoriaModificacion dentro
  de la misma transacción (§25).
- ``resolvio_problema`` es un dato contextual (§10): se almacena y se
  expone sin lógica adicional alguna.
"""

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.fechas import fecha_negocio_hoy
from app.models.cuenta_acceso import CuentaAcceso
from app.models.participacion import Participacion
from app.models.proyecto import Proyecto
from app.schemas.participacion import (
    ParticipacionCreateIn,
    ParticipacionEmpleadoUpdateIn,
    ParticipacionOut,
    ParticipacionRhUpdateIn,
)
from app.services import auditoria_service

MAX_POR_PAGINA = 100
POR_PAGINA_DEFECTO = 20


def crear_participacion(
    db: Session, *, empleado_id: int, datos: ParticipacionCreateIn
) -> Participacion:
    """Registro inicial de una participación por el Empleado autenticado."""
    if db.get(Proyecto, datos.proyecto_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proyecto no encontrado.",
        )

    duplicada = db.scalar(
        select(Participacion).where(
            Participacion.empleado_id == empleado_id,
            Participacion.proyecto_id == datos.proyecto_id,
        )
    )
    if duplicada is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una participación de este empleado en ese proyecto.",
        )

    participacion = Participacion(
        empleado_id=empleado_id,
        proyecto_id=datos.proyecto_id,
        rol=datos.rol,
        entregables=datos.entregables,
        en_equipo=datos.en_equipo,
        coordino_tareas=datos.coordino_tareas,
        explico_a_publico_distinto=datos.explico_a_publico_distinto,
        resolvio_problema=datos.resolvio_problema,
        horas=datos.horas,
        # Fecha de negocio calculada por el servidor (§12), nunca del cliente.
        fecha_registro=fecha_negocio_hoy(),
    )
    db.add(participacion)
    db.commit()
    db.refresh(participacion)
    return participacion


def obtener_participacion(db: Session, participacion_id: int) -> Participacion:
    participacion = db.scalar(
        select(Participacion)
        .options(joinedload(Participacion.proyecto))
        .where(Participacion.id == participacion_id)
    )
    if participacion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Participación no encontrada.",
        )
    return participacion


def obtener_participacion_propia(
    db: Session, *, cuenta: CuentaAcceso, participacion_id: int
) -> Participacion:
    """Ownership (§32): 404 uniforme si la participación es ajena."""
    participacion = obtener_participacion(db, participacion_id)
    if participacion.empleado_id != cuenta.empleado_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Participación no encontrada.",
        )
    return participacion


def listar_participaciones(
    db: Session,
    *,
    empleado_id: int,
    pagina: int = 1,
    por_pagina: int = POR_PAGINA_DEFECTO,
) -> tuple[list[Participacion], int]:
    """Lista paginada de las participaciones de un empleado."""
    por_pagina = min(max(por_pagina, 1), MAX_POR_PAGINA)
    pagina = max(pagina, 1)

    total = db.scalar(
        select(func.count())
        .select_from(Participacion)
        .where(Participacion.empleado_id == empleado_id)
    )
    participaciones = db.scalars(
        select(Participacion)
        .options(joinedload(Participacion.proyecto))
        .where(Participacion.empleado_id == empleado_id)
        .order_by(Participacion.fecha_registro.desc(), Participacion.id.desc())
        .offset((pagina - 1) * por_pagina)
        .limit(por_pagina)
    ).unique().all()
    return list(participaciones), int(total or 0)


def listar_participaciones_proyecto(
    db: Session,
    *,
    proyecto_id: int,
    pagina: int = 1,
    por_pagina: int = POR_PAGINA_DEFECTO,
) -> tuple[list[Participacion], int]:
    """Lista paginada de las participaciones de un proyecto (RH-02.1, §20.3).

    Mismo orden que el listado por empleado (``fecha_registro`` DESC, ``id``
    DESC): es orden cronológico de registro, NO un ranking de participantes.
    Incluye el ``empleado`` (joinedload) para la identificación de
    presentación del mapper ``a_participacion_out_con_empleado``.
    """
    por_pagina = min(max(por_pagina, 1), MAX_POR_PAGINA)
    pagina = max(pagina, 1)

    total = db.scalar(
        select(func.count())
        .select_from(Participacion)
        .where(Participacion.proyecto_id == proyecto_id)
    )
    participaciones = db.scalars(
        select(Participacion)
        .options(joinedload(Participacion.proyecto), joinedload(Participacion.empleado))
        .where(Participacion.proyecto_id == proyecto_id)
        .order_by(Participacion.fecha_registro.desc(), Participacion.id.desc())
        .offset((pagina - 1) * por_pagina)
        .limit(por_pagina)
    ).unique().all()
    return list(participaciones), int(total or 0)


def a_participacion_out_con_empleado(participacion: Participacion) -> ParticipacionOut:
    """``ParticipacionOut`` con la identificación del empleado (RH-02.1).

    Nombre y puesto provienen del contrato backend (join con ``Empleado``):
    el frontend nunca resuelve la identidad con una consulta propia ni
    muestra el ID técnico. Sin cálculos ni métricas: solo presentación.
    """
    salida = ParticipacionOut.model_validate(participacion)
    empleado = participacion.empleado
    salida.empleado_nombre = empleado.nombre if empleado is not None else None
    salida.empleado_puesto = empleado.puesto if empleado is not None else None
    return salida


def actualizar_participacion_empleado(
    db: Session,
    participacion: Participacion,
    datos: ParticipacionEmpleadoUpdateIn,
    cuenta: CuentaAcceso,
) -> Participacion:
    """Edición del Empleado: SOLO rol/entregables/horas (PRD §12.1).

    Toda modificación REAL genera una ``AuditoriaModificacion`` con la
    operación ``MODIFICACION_EMPLEADO`` —distinta de la ``CORRECCION`` de RH—
    DENTRO de la misma transacción que el cambio (§25, ampliado para auditar
    también las modificaciones del empleado). El actor es la cuenta del propio
    Empleado. Si el cuerpo no cambia ningún campo respecto al valor actual, no
    hay cambio real: se rechaza con 422 y NO se genera auditoría.

    ``motivo`` no aplica al Empleado (§25 lo reserva al formulario
    administrativo de RH): queda en ``None``.
    """
    cambios = datos.model_dump(exclude_unset=True)
    # Solo los campos cuyo valor realmente difiere: nunca se audita un
    # no-cambio (valores anteriores/nuevos idénticos).
    cambios_reales = {
        campo: valor
        for campo, valor in cambios.items()
        if getattr(participacion, campo) != valor
    }
    if not cambios_reales:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Debe proporcionar al menos un campo a actualizar.",
        )

    # Snapshot previo de los campos realmente modificados (auditoría §25).
    valores_anteriores = {
        campo: getattr(participacion, campo) for campo in cambios_reales
    }
    for campo, valor in cambios_reales.items():
        setattr(participacion, campo, valor)
    valores_nuevos = dict(cambios_reales)

    # Auditoría DENTRO de la misma transacción: mismo flush/commit (§25), con
    # el actor = cuenta del Empleado autenticado.
    auditoria_service.registrar(
        db,
        cuenta_actor=cuenta,
        entidad="participacion",
        entidad_id=participacion.id,
        operacion=auditoria_service.OPERACION_MODIFICACION_EMPLEADO,
        valores_anteriores=valores_anteriores,
        valores_nuevos=valores_nuevos,
    )
    db.commit()
    db.refresh(participacion)
    return participacion


def corregir_participacion_rh(
    db: Session,
    *,
    participacion: Participacion,
    datos: ParticipacionRhUpdateIn,
    cuenta_rh: CuentaAcceso,
) -> Participacion:
    """Corrección administrativa de RH, auditada en la MISMA transacción.

    El esquema ya garantiza (extra="forbid") que no se pueden enviar
    ``empleado_id``, ``proyecto_id`` ni ``fecha_registro``.
    """
    cambios = datos.model_dump(exclude_unset=True)
    motivo = cambios.pop("motivo", None)
    if not cambios:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Debe proporcionar al menos un campo a corregir.",
        )

    # Snapshot previo para la auditoría (solo los campos corregidos).
    valores_anteriores = {campo: getattr(participacion, campo) for campo in cambios}
    for campo, valor in cambios.items():
        setattr(participacion, campo, valor)
    valores_nuevos = dict(cambios)

    # Auditoría DENTRO de la misma transacción: mismo flush/commit (§25).
    auditoria_service.registrar(
        db,
        cuenta_actor=cuenta_rh,
        entidad="participacion",
        entidad_id=participacion.id,
        operacion=auditoria_service.OPERACION_CORRECCION,
        valores_anteriores=valores_anteriores,
        valores_nuevos=valores_nuevos,
        motivo=motivo,
    )
    db.commit()
    db.refresh(participacion)
    return participacion

    return participacion
