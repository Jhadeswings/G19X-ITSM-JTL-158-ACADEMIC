"""DTOs de mentoría (PRD v1.3 §14, Especificación Técnica v1.5 §29).

La selección del mentor es 100% determinista y por reglas (§29.3): sin IA,
sin score global y sin etiquetas de "mejor empleado"/"top mentor". La
respuesta expresa la justificación con el concepto obligatorio
``Criterio del sistema`` (PRD §14.3).

Tres casos de respuesta, sin estados adicionales (§29.1):
- sugerencia encontrada  → ``elegible=true``  + ``mentor`` presente;
- receptor no elegible   → ``elegible=false`` + ``mentor=null``
  (nivel 5, Datos insuficientes o receptor inactivo);
- ningún mentor elegible → ``elegible=true``  + ``mentor=null``
  (nadie cumple los requisitos §29.2).
"""

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.resultado_actual import ClaveCompetencia


class SugerenciaMentoriaIn(BaseModel):
    """Entrada de la sugerencia de mentoría: SOLO receptor y competencia.

    ``extra="forbid"``: el cliente NO puede introducir datos del mentor,
    niveles ni criterios (§29): todo lo calcula el backend.
    """

    model_config = ConfigDict(extra="forbid")

    receiver_id: int = Field(ge=1)
    competency_code: ClaveCompetencia


class MentorOut(BaseModel):
    """Mentor sugerido: identificación + nivel en la competencia objetivo."""

    empleado_id: int
    nombre: str
    nivel: int


class SugerenciaMentoriaOut(BaseModel):
    """Respuesta de ``MentorshipService.suggest`` (consulta derivada).

    ``nivel_receiver`` es ``None`` cuando la competencia objetivo está en
    ``INSUFFICIENT_DATA``. ``criterio_del_sistema`` es la explicación
    estructurada del porqué (PRD §14.3: etiqueta obligatoria, nunca
    "mejor talento").
    """

    receiver_id: int
    competency_code: str
    nivel_receiver: int | None = None
    elegible: bool
    mentor: MentorOut | None = None
    criterio_del_sistema: str