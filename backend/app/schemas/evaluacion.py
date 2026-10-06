"""DTOs de 9-Box y evaluaciones históricas (Fase 6).

Separación de contratos (Especificación Técnica v1.5 §20–§24):
- ``NineBoxDTO``: salida del servicio puro 9-Box.
- ``EvaluacionOut``: evaluación histórica COMPLETA para RH (incluye 9-Box,
  exclusivo de RH según PRD §10).
- ``EvaluacionEmpleadoOut``: evaluación histórica propia del Empleado SIN
  ejes ni 9-Box (PRD §21: "No muestra ejes ni 9-Box").
- ``EvaluacionPageOut`` / ``EvaluacionEmpleadoPageOut``: historiales.
- ``GeneracionEvaluacionesOut``: resultado de la generación (solo RH).

Los DTOs históricos son SNAPSHOTS capturados al generar: nunca se
recalculan al consultarlos y deben distinguirse claramente del
``ResultadoActualDTO`` (Fase 5), que vive solo en memoria.
"""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class NineBoxDTO(BaseModel):
    """Ejes y celda 9-Box (§20).

    Todo ``None`` cuando cualquiera de las cinco competencias quedó en
    INSUFFICIENT_DATA (§20.2).
    """

    performance_axis: Decimal | None = None
    potential_axis: Decimal | None = None
    box_code: str | None = None
    etiqueta_performance: str | None = None
    etiqueta_potencial: str | None = None


class CompetenciaHistoricaDTO(BaseModel):
    """Nivel y estado históricos de UNA competencia (snapshot, §21).

    ``nivel`` es ``None`` cuando ``status`` es ``INSUFFICIENT_DATA``:
    DI nunca se convierte a nivel 0 (§14).
    """

    clave: str
    nivel: int | None = None
    status: str  # CALCULABLE | INSUFFICIENT_DATA


class EvaluacionBaseOut(BaseModel):
    """Campos comunes del snapshot histórico (§21)."""

    id: int
    empleado_id: int
    periodo: str
    competencias: list[CompetenciaHistoricaDTO]
    generado_en: datetime
    generado_por_cuenta_id: int


class EvaluacionOut(EvaluacionBaseOut):
    """Evaluación histórica oficial para RH, INCLUYE 9-Box (PRD §10)."""

    nine_box: NineBoxDTO

    # RH-01.1: identificación del empleado CAPTURADA al generar el snapshot.
    # Sale del propio histórico, nunca de una consulta al empleado actual:
    # la lectura no mezcla tiempos. ``None`` solo en snapshots previos a
    # RH-01.1 o cuando el empleado no tenía puesto/área al evaluarse (§30);
    # el cliente no debe inventar valores en ese caso.
    empleado_nombre: str | None = None
    empleado_puesto: str | None = None
    empleado_area: str | None = None


class EvaluacionEmpleadoOut(EvaluacionBaseOut):
    """Evaluación histórica propia del Empleado: SIN ejes ni 9-Box (PRD §21)."""


class EvaluacionPageOut(BaseModel):
    total: int
    pagina: int
    por_pagina: int
    items: list[EvaluacionOut]


class EvaluacionEmpleadoPageOut(BaseModel):
    total: int
    pagina: int
    por_pagina: int
    items: list[EvaluacionEmpleadoOut]


class GeneracionEvaluacionesOut(BaseModel):
    """Resultado de la generación del periodo vigente (solo RH, §23)."""

    periodo: str
    total_generadas: int
    items: list[EvaluacionOut]