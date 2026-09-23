"""Esquemas Pydantic de gestión de empleados (Fase 4A).

El correo de acceso NO se duplica en Empleado (PRD §3.2): se expone
únicamente leyéndolo desde CuentaAcceso cuando el DTO lo requiere.
Nunca se exponen credenciales en las respuestas.
"""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


def _no_vacio(valor: str) -> str:
    if not valor.strip():
        raise ValueError("El campo no puede estar vacío.")
    return valor.strip()


class CuentaResumenOut(BaseModel):
    """Resumen de la CuentaAcceso asociada (sin credenciales)."""

    model_config = ConfigDict(from_attributes=True)

    email: str
    rol: str
    activo: bool
    must_change_password: bool


class EmpleadoCreateIn(BaseModel):
    """Alta de empleado por RH (PRD §3.3)."""

    nombre: str
    email: EmailStr
    puesto: str | None = None
    area: str | None = None
    fecha_ingreso: date | None = None

    @field_validator("nombre")
    @classmethod
    def _nombre(cls, valor: str) -> str:
        return _no_vacio(valor)


class EmpleadoUpdateIn(BaseModel):
    """Actualización de datos administrativos por RH (PATCH parcial)."""

    nombre: str | None = None
    puesto: str | None = None
    area: str | None = None
    fecha_ingreso: date | None = None

    @field_validator("nombre")
    @classmethod
    def _nombre(cls, valor: str | None) -> str | None:
        return None if valor is None else _no_vacio(valor)


class EstadoEmpleadoIn(BaseModel):
    """Cambio de estado activo/inactivo del empleado."""

    activo: bool


class EmpleadoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    puesto: str | None = None
    area: str | None = None
    fecha_ingreso: date | None = None
    activo: bool
    cuenta: CuentaResumenOut | None = None
    created_at: datetime
    updated_at: datetime


class EmpleadoPageOut(BaseModel):
    """Página de la lista administrativa de empleados (§40: paginar listas RH)."""

    total: int
    pagina: int
    por_pagina: int
    items: list[EmpleadoOut]
