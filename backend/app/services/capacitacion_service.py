"""Servicio de capacitaciones (Fase 4B).

Reglas (PRD §21.4, Especificación §11):
- El Empleado registra: nombre, fecha, completado.
- Ownership estricto en backend (§32): solo las propias; 404 uniforme
  para recursos ajenos.
- La lógica del año calendario local (America/Mexico_City) pertenece a
  CompetencyEngine (fase posterior): aquí NO se calcula nada.
- No existen edición/eliminación ni endpoints RH: ningún documento los
  define.
"""

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.capacitacion import Capacitacion
from app.models.cuenta_acceso import CuentaAcceso
from app.schemas.capacitacion import CapacitacionCreateIn

MAX_POR_PAGINA = 100
POR_PAGINA_DEFECTO = 20


def crear_capacitacion(
    db: Session, *, empleado_id: int, datos: CapacitacionCreateIn
) -> Capacitacion:
    capacitacion = Capacitacion(
        empleado_id=empleado_id,  # siempre desde la cuenta autenticada (§32)
        nombre=datos.nombre,
        fecha=datos.fecha,
        completado=datos.completado,
    )
    db.add(capacitacion)
    db.commit()
    db.refresh(capacitacion)
    return capacitacion


def obtener_capacitacion(db: Session, capacitacion_id: int) -> Capacitacion:
    capacitacion = db.get(Capacitacion, capacitacion_id)
    if capacitacion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Capacitación no encontrada.",
        )
    return capacitacion


def obtener_capacitacion_propia(
    db: Session, *, cuenta: CuentaAcceso, capacitacion_id: int
) -> Capacitacion:
    """Ownership (§32): 404 uniforme si la capacitación es ajena."""
    capacitacion = obtener_capacitacion(db, capacitacion_id)
    if capacitacion.empleado_id != cuenta.empleado_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Capacitación no encontrada.",
        )
    return capacitacion


def listar_capacitaciones(
    db: Session, *, empleado_id: int, pagina: int = 1, por_pagina: int = POR_PAGINA_DEFECTO
) -> tuple[list[Capacitacion], int]:
    """Lista paginada de las capacitaciones propias del empleado."""
    por_pagina = min(max(por_pagina, 1), MAX_POR_PAGINA)
    pagina = max(pagina, 1)

    total = db.scalar(
        select(func.count())
        .select_from(Capacitacion)
        .where(Capacitacion.empleado_id == empleado_id)
    )
    capacitaciones = db.scalars(
        select(Capacitacion)
        .where(Capacitacion.empleado_id == empleado_id)
        .order_by(Capacitacion.fecha.desc(), Capacitacion.id.desc())
        .offset((pagina - 1) * por_pagina)
        .limit(por_pagina)
    ).all()
    return list(capacitaciones), int(total or 0)
