"""DTOs del ResultadoActual (Fase 5, Especificación Técnica §13–§19).

- La salida del CompetencyEngine distingue resultado numérico, nivel,
  estado CALCULABLE | INSUFFICIENT_DATA y evidencia de soporte (§13).
- "Datos insuficientes" NO es un entero ni nivel 0 (§14): ``nivel`` queda
  en ``None`` y el estado lo expresa ``INSUFFICIENT_DATA``.
- ``ResultadoActual`` NO tiene tabla ni modelo persistente (§18): estos
  DTOs existen SOLO en memoria y derivan del estado actual de PostgreSQL.
"""

from datetime import date
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, computed_field


class EstadoCompetencia(str, Enum):
    """Estado de calculabilidad (§14): CALCULABLE | INSUFFICIENT_DATA."""

    CALCULABLE = "CALCULABLE"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"


class ClaveCompetencia(str, Enum):
    """Las CINCO competencias exactas (§16). Experiencia NO es una."""

    DESEMPENO_TECNICO = "desempeno_tecnico"
    LIDERAZGO = "liderazgo"
    TRABAJO_EQUIPO = "trabajo_equipo"
    COMUNICACION = "comunicacion"
    APRENDIZAJE = "aprendizaje"


# Etiquetas de presentación (§14). NO son fuente primaria de negocio:
# se derivan deterministamente del nivel entero.
_ETIQUETAS_NIVEL = {
    1: "Inicial",
    2: "En desarrollo",
    3: "En crecimiento",
    4: "Consolidado",
    5: "Alto",
}


class CompetenciaResultadoDTO(BaseModel):
    """Resultado de una competencia (§13–§15).

    - ``nivel`` es ``None`` cuando ``estado`` es ``INSUFFICIENT_DATA``.
    - ``valor`` es el porcentaje 0–100 (o el score A/B en aprendizaje).
    - ``evidencia`` contiene los contadores de soporte.
    """

    clave: ClaveCompetencia
    estado: EstadoCompetencia
    nivel: int | None = None
    valor: Decimal | None = None
    evidencia: dict[str, int | str | Decimal]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def etiqueta(self) -> str | None:
        """Etiqueta de presentación derivada del nivel (§14). None si DI."""
        return None if self.nivel is None else _ETIQUETAS_NIVEL[self.nivel]


class ExperienciaDTO(BaseModel):
    """Experiencia contextual (§17). No es competencia: no produce
    fortalezas, oportunidades, ni entra en filtros de alto potencial."""

    fecha_ingreso: date | None
    anios_antiguedad: Decimal | None
    proyectos_unicos: int


class ResultadoActualDTO(BaseModel):
    """Resultado actual en memoria (§18). Nunca se persiste."""

    empleado_id: int
    competencias: list[CompetenciaResultadoDTO]
    experiencia: ExperienciaDTO
    fortalezas: list[ClaveCompetencia]
    oportunidades: list[ClaveCompetencia]
