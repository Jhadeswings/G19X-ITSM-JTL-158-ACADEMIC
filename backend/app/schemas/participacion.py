"""Esquemas Pydantic de participaciones (Fase 4B)."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.proyecto import ProyectoOut


def _no_vacio(valor: str) -> str:
    if not valor.strip():
        raise ValueError("El campo no puede estar vacío.")
    return valor.strip()


class ParticipacionCreateIn(BaseModel):
    """Registro inicial: se capturan TODOS los indicadores (PRD §12).

    ``empleado_id`` NO se acepta del cliente: siempre se deriva de la
    cuenta autenticada (§32). ``fecha_registro`` la fija el servidor con
    la fecha de negocio (America/Mexico_City).
    """

    model_config = ConfigDict(extra="forbid")

    proyecto_id: int = Field(ge=1)
    rol: str
    entregables: str | None = None
    en_equipo: bool = False
    coordino_tareas: bool = False
    explico_a_publico_distinto: bool = False
    # Dato contextual (§10): se almacena y se expone, sin lógica adicional.
    resolvio_problema: bool = False
    horas: int = Field(ge=0)

    @field_validator("rol")
    @classmethod
    def _rol(cls, valor: str) -> str:
        return _no_vacio(valor)


class ParticipacionEmpleadoUpdateIn(BaseModel):
    """Edición del Empleado tras el alta: SOLO rol/entregables/horas (PRD §12.1).

    ``extra="forbid"``: cualquier campo bloqueado (empleado_id, proyecto_id,
    en_equipo, coordino_tareas, explico_a_publico_distinto,
    resolvio_problema, fecha_registro) se RECHAZA con 422. Contrato
    estricto: nunca se ignora silenciosamente.
    """

    model_config = ConfigDict(extra="forbid")

    rol: str | None = None
    entregables: str | None = None
    horas: int | None = Field(default=None, ge=0)


class ParticipacionRhUpdateIn(BaseModel):
    """Corrección administrativa de RH (PRD §12.2, Especificación §9.1).

    RH corrige los campos administrativos del modelo EXCEPTO
    ``empleado_id``, ``proyecto_id`` y ``fecha_registro`` (no son
    corrección: romperían la identidad y unicidad del registro).
    ``motivo`` es opcional (§25: "puede existir si está definido por el
    formulario administrativo").
    """

    model_config = ConfigDict(extra="forbid")

    rol: str | None = None
    entregables: str | None = None
    en_equipo: bool | None = None
    coordino_tareas: bool | None = None
    explico_a_publico_distinto: bool | None = None
    resolvio_problema: bool | None = None
    horas: int | None = Field(default=None, ge=0)
    motivo: str | None = Field(default=None, max_length=512)


class ParticipacionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empleado_id: int
    proyecto_id: int
    rol: str
    entregables: str | None = None
    en_equipo: bool
    coordino_tareas: bool
    explico_a_publico_distinto: bool
    resolvio_problema: bool
    horas: int
    fecha_registro: date
    proyecto: ProyectoOut | None = None
    created_at: datetime
    updated_at: datetime


class ParticipacionPageOut(BaseModel):
    total: int
    pagina: int
    por_pagina: int
    items: list[ParticipacionOut]
