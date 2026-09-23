"""Esquemas Pydantic de proyectos (Fase 4A)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

# Estados oficiales (Especificación Técnica §6, PRD §11)
EstadoProyecto = Literal["EN_PROCESO", "COMPLETADO", "CANCELADO"]


def _no_vacio(valor: str) -> str:
    if not valor.strip():
        raise ValueError("El campo no puede estar vacío.")
    return valor.strip()


class ProyectoCreateIn(BaseModel):
    """Creación de proyecto por Empleado (siempre inicia EN_PROCESO, §6)."""

    nombre: str
    area: str | None = None
    cliente: str | None = None

    @field_validator("nombre")
    @classmethod
    def _nombre(cls, valor: str) -> str:
        return _no_vacio(valor)


class ProyectoUpdateIn(BaseModel):
    """Edición administrativa de un proyecto EXISTENTE por RH."""

    nombre: str | None = None
    area: str | None = None
    cliente: str | None = None
    estado: EstadoProyecto | None = None

    @field_validator("nombre")
    @classmethod
    def _nombre(cls, valor: str | None) -> str | None:
        return None if valor is None else _no_vacio(valor)


class ProyectoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    nombre_normalizado: str
    area: str | None = None
    cliente: str | None = None
    estado: str
    created_at: datetime
    updated_at: datetime


class ProyectoPageOut(BaseModel):
    total: int
    pagina: int
    por_pagina: int
    items: list[ProyectoOut]


class SugerenciaOut(BaseModel):
    """Sugerencia aproximada (informativa, §8): nunca crea una relación."""

    proyecto: ProyectoOut
    similitud: float


class ResultadoBusquedaOut(BaseModel):
    """Resultado de la búsqueda obligatoria previa a crear un proyecto.

    Si existe coincidencia exacta por ``nombre_normalizado`` se identifica
    claramente como proyecto existente; las sugerencias aproximadas son
    una advertencia informativa y NO impiden crear un proyecto nuevo.
    """

    consulta_normalizada: str
    coincidencia_exacta: ProyectoOut | None = None
    sugerencias: list[SugerenciaOut] = []
