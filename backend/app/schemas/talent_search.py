"""DTOs de la búsqueda manual de talento (PRD §13.1, Especificación §26).

Contrato ESTRICTO (Pydantic):
- ``competencies`` obligatorio y con al menos UN criterio;
- ``code`` solo admite las CINCO competencias soportadas (enum cerrado:
  códigos desconocidos se rechazan con 422);
- ``min_level`` entero 1–5 (el estándar de producto es 4, pero el backend
  acepta 1–5, PRD §13.1);
- ``extra="forbid"``: no se aceptan campos de selección arbitrarios (p. ej.
  ``employee_id`` del cliente) — protección IDOR (§32).

La respuesta expone niveles y estado de las competencias CONSULTADAS y un
``promedio_seleccionadas`` puramente informativo (PRD §13.2): no es una
competencia nueva, no es ResultadoActual, no es score global, no es
ranking y NO se persiste jamás.
"""

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.resultado_actual import ClaveCompetencia

ESTADO_CALCULABLE = "CALCULABLE"
ESTADO_INSUFICIENTE = "INSUFFICIENT_DATA"


class CriterioCompetenciaIn(BaseModel):
    """Un criterio: competencia soportada + nivel mínimo exigido (AND)."""

    model_config = ConfigDict(extra="forbid")

    code: ClaveCompetencia
    min_level: int = Field(ge=1, le=5)


class BusquedaManualIn(BaseModel):
    """Criterios de la búsqueda manual (AND entre todos, §26)."""

    model_config = ConfigDict(extra="forbid")

    competencies: list[CriterioCompetenciaIn] = Field(min_length=1)

    @field_validator("competencies")
    @classmethod
    def _sin_duplicados(cls, criterios):
        codigos = [criterio.code for criterio in criterios]
        if len(set(codigos)) != len(codigos):
            raise ValueError(
                "No se permiten competencias duplicadas en los criterios."
            )
        return criterios


class CompetenciaBusquedaOut(BaseModel):
    """Nivel y estado de UNA competencia consultada en el resultado.

    ``nivel`` es ``None`` cuando ``estado`` es ``INSUFFICIENT_DATA`` (§14).
    En resultados de búsqueda el estado siempre es CALCULABLE porque DI no
    satisface ningún criterio numérico (PRD §13.1); el campo existe para
    que el contrato exprese el estado cuando corresponda.
    """

    code: str
    estado: str
    nivel: int | None = None


class EmpleadoBusquedaOut(BaseModel):
    """Resultado operativo: datos básicos + competencias consultadas.

    ``promedio_seleccionadas`` es orden informativo (PRD §13.2): jamás se
    persiste ni constituye score/ranking.
    """

    empleado_id: int
    nombre: str
    area: str | None = None
    competencias: list[CompetenciaBusquedaOut]
    promedio_seleccionadas: Decimal | None = None


class BusquedaManualOut(BaseModel):
    """Respuesta de TalentSearchService.search_manual (solo RH)."""

    total: int
    criterios: list[CriterioCompetenciaIn]  # eco para revisión de RH (§27)
    items: list[EmpleadoBusquedaOut]
