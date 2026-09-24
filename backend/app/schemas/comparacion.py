"""DTOs de comparación de empleados (PRD v1.3 §20.5).

Comparación = vista lateral DERIVADA: cinco competencias actuales +
experiencia como CONTEXTO. El PRD prohíbe explícitamente mostrar 9-Box,
declarar un ganador o producir cualquier score/ranking global (§20.5).

El contrato de entrada es estricto (``extra="forbid"``): el cliente SOLO
envía IDs de empleados activos; jamás nombres, niveles ni resultados. El
backend resuelve todos los datos a partir del estado actual (no se confía
en nada calculado por el cliente).
"""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.resultado_actual import CompetenciaResultadoDTO, ExperienciaDTO


class ComparacionIn(BaseModel):
    """Entrada de la comparación: SOLO la lista de IDs (PRD §20.5).

    - ``employee_ids`` obligatorio, mínimo 2 (el PRD exige 2 o más);
    - enteros positivos (``ge=1`` por elemento);
    - sin duplicados (comparar dos veces al mismo empleado no aporta);
    - ``extra="forbid"``: nombres, niveles, resultados o cualquier campo
      adicional enviado por el cliente se RECHAZAN (422).
    """

    model_config = ConfigDict(extra="forbid")

    employee_ids: list[Annotated[int, Field(ge=1)]] = Field(min_length=2)

    @field_validator("employee_ids")
    @classmethod
    def _sin_duplicados(cls, valores: list[int]) -> list[int]:
        if len(set(valores)) != len(valores):
            raise ValueError("employee_ids no debe contener duplicados.")
        return valores


class EmpleadoComparadoOut(BaseModel):
    """Un empleado dentro de la comparación (vista lateral, PRD §20.5).

    Identificación + cinco competencias actuales + experiencia como
    contexto. ``CompetenciaResultadoDTO`` y ``ExperienciaDTO`` son los
    DTOs EXISTENTES del ResultadoActual: no se duplican fórmulas ni
    estructuras, y ``INSUFFICIENT_DATA`` se preserva tal cual (``nivel``
    en ``None``, nunca 0). NO incluye 9-Box, fortalezas, oportunidades,
    score ni posición: la comparación no declara ganador.
    """

    empleado_id: int
    nombre: str
    puesto: str | None
    area: str | None
    competencias: list[CompetenciaResultadoDTO]
    experiencia: ExperienciaDTO


class ComparacionOut(BaseModel):
    """Respuesta de ``ComparisonService.compare`` (vista derivada).

    ``items`` conserva EXACTAMENTE el orden de ``employee_ids`` recibido
    (decisión documentada: orden neutral determinista, sin clasificación
    implícita por promedio ni nivel). ``total`` = ``len(items)``.
    """

    total: int
    items: list[EmpleadoComparadoOut]
