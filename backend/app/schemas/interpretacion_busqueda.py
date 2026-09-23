"""DTOs de la interpretación de búsqueda con lenguaje natural (§27).

Flujo (Especificación §27): ``query_text`` → AIOrchestrator →
``CriteriosInterpretadosDTO`` (StructuredSearchCriteriaDTO) → validación
Pydantic → revisión RH → TalentSearchService.

La IA SOLO interpreta intención (PRD §17.3): jamás calcula competencias,
calcula 9-Box, selecciona empleados, produce nombres/IDs ni decide quién
es "mejor". Por eso el DTO de salida es CERRADO (``extra="forbid"``):
cualquier campo no permitido — ``employee_id``, ``candidate_names``,
``winner``, ``talent_score``, ``reason_for_selection``,
``recommended_employee``... — invalida la interpretación completa (§27.2).

``competencies`` reutiliza el MISMO contrato que la búsqueda manual
(``CriterioCompetenciaIn``), de modo que la salida es consumible
directamente por ``TalentSearchService`` tras la revisión de RH.
"""

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.talent_search import CriterioCompetenciaIn

MAX_QUERY_TEXT = 500


class InterpretacionIn(BaseModel):
    """Entrada del endpoint de interpretación: SOLO texto de RH (§27.1).

    ``extra="forbid"``: no se aceptan criterios adicionales, empleados ni
    IDs como entrada de la interpretación.
    """

    model_config = ConfigDict(extra="forbid")

    query_text: str

    @field_validator("query_text")
    @classmethod
    def _texto(cls, valor: str) -> str:
        limpio = valor.strip()
        if not limpio:
            raise ValueError("El texto de la búsqueda no puede estar vacío.")
        if len(limpio) > MAX_QUERY_TEXT:
            raise ValueError(
                f"El texto de la búsqueda no puede exceder {MAX_QUERY_TEXT} caracteres."
            )
        return limpio


class CriteriosInterpretadosDTO(BaseModel):
    """StructuredSearchCriteriaDTO (§27.2): salida ÚNICA válida del LLM.

    ``area``/``position`` son opcionales e informativos para la revisión
    de RH (aún no son filtros de TalentSearchService: se aplicarán cuando
    el producto los defina). Todo campo fuera de este contrato invalida
    la interpretación (``extra="forbid"``, §27.2).
    """

    model_config = ConfigDict(extra="forbid")

    competencies: list[CriterioCompetenciaIn] = Field(min_length=1)
    area: str | None = None
    position: str | None = None

    @field_validator("competencies")
    @classmethod
    def _sin_duplicados(cls, criterios):
        codigos = [criterio.code for criterio in criterios]
        if len(set(codigos)) != len(codigos):
            raise ValueError(
                "No se permiten competencias duplicadas en los criterios."
            )
        return criterios


class InterpretacionOut(BaseModel):
    """Respuesta del endpoint de interpretación (NO ejecuta la búsqueda).

    ``proveedor`` es metadato operacional informativo (qué adaptador
    respondió); no forma parte de los criterios.
    """

    proveedor: str
    criterios: CriteriosInterpretadosDTO
