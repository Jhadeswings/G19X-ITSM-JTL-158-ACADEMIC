"""Esquemas Pydantic de capacitaciones (Fase 4B).

PRD §21.4: registrar nombre, fecha, completado. No existen en los
documentos edición ni eliminación de capacitaciones, ni endpoints RH.
"""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CapacitacionCreateIn(BaseModel):
    """Registro de capacitación propia (PRD §21.4, Especificación §11).

    ``empleado_id`` NO se acepta del cliente: se deriva de la cuenta
    autenticada (§32). ``fecha`` es la fecha del curso (la lógica del año
    calendario local pertenece a CompetencyEngine, fase posterior).
    """

    model_config = ConfigDict(extra="forbid")

    nombre: str
    fecha: date
    completado: bool = False

    @field_validator("nombre")
    @classmethod
    def _nombre(cls, valor: str) -> str:
        if not valor.strip():
            raise ValueError("El campo no puede estar vacío.")
        return valor.strip()


class CapacitacionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empleado_id: int
    nombre: str
    fecha: date
    completado: bool
    created_at: datetime
    updated_at: datetime


class CapacitacionPageOut(BaseModel):
    total: int
    pagina: int
    por_pagina: int
    items: list[CapacitacionOut]
