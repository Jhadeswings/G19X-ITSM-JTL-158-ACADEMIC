"""DTOs de recomendaciones de desarrollo con IA (PRD §17.2, §18, §21.2).

La IA es una capa de APOYO (PRD §17): puede explicar resultados calculados
y proponer acciones de desarrollo, pero JAMÁS calcula competencias, decide
fortalezas/oportunidades, calcula 9-Box, selecciona empleados ni crea
score global. La regla conceptual del Style Guide §17.3:

    Datos → Resultado calculado (reglas) → Explicación/Recomendación IA

NUNCA: IA → Resultado oficial. Por eso la respuesta del endpoint separa
estructuralmente el bloque de datos calculados por el sistema del bloque
generado por IA, con procedencia explícita (Style Guide §3.6).
"""

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.resultado_actual import ResultadoActualDTO

# Límites del contrato de salida del LLM (decisión técnica: mantener la
# salida pequeña, concreta y validable; ET §37 "solo JSON compatible").
MAX_RECOMMENDATION = 500
MAX_ACCIONES = 5
MAX_ACCION = 200

# PRD §17.3/Style Guide §25: la IA no emite juicios sobre la persona.
# Lista MÍNIMA y cerrada (no un filtro de lenguaje general): solo los
# términos que la documentación prohíbe explícitamente.
_JUICIOS_PROHIBIDOS = (
    "mejor empleado",
    "top talento",
    "ganador",
    "bajo potencial",
    "empleado insuficiente",
)


class SalidaRecomendacionIA(BaseModel):
    """Contrato CERRADO y ÚNICO válido de la salida del LLM (ET §37).

    ``extra="forbid"``: cualquier campo adicional — ``employee_id``,
    ``winner``, ``recommended_employee``, ``talent_score``, ``score``,
    ``nivel``, ``competency_level``, ``box_code``, ``performance_axis``,
    ``potential_axis``, ``strengths_generated_by_ai``,
    ``opportunities_generated_by_ai``, nombres... — invalida la salida
    completa y se trata como fallo del proveedor (→ fallback, §38).
    La IA NO puede devolver una nueva clasificación del empleado.
    """

    model_config = ConfigDict(extra="forbid")

    recommendation: str
    actions: list[str] = Field(default_factory=list, max_length=MAX_ACCIONES)

    @field_validator("recommendation")
    @classmethod
    def _recomendacion_valida(cls, valor: str) -> str:
        limpio = valor.strip()
        if not limpio:
            raise ValueError("La recomendación no puede estar vacía.")
        if len(limpio) > MAX_RECOMMENDATION:
            raise ValueError(
                f"La recomendación no puede exceder {MAX_RECOMMENDATION} caracteres."
            )
        _sin_juicios(limpio)
        return limpio

    @field_validator("actions")
    @classmethod
    def _acciones_validas(cls, valores: list[str]) -> list[str]:
        limpias = []
        for valor in valores:
            limpia = valor.strip()
            if not limpia:
                raise ValueError("Las acciones no pueden estar vacías.")
            if len(limpia) > MAX_ACCION:
                raise ValueError(
                    f"Cada acción no puede exceder {MAX_ACCION} caracteres."
                )
            _sin_juicios(limpia)
            limpias.append(limpia)
        return limpias


def _sin_juicios(texto: str) -> None:
    """Rechaza los juicios sobre la persona que el PRD prohíbe (§17.3)."""
    minusculas = texto.lower()
    for juicio in _JUICIOS_PROHIBIDOS:
        if juicio in minusculas:
            raise ValueError(
                "La salida contiene un juicio sobre la persona, no una "
                "sugerencia de desarrollo."
            )


class RecomendacionIABloqueOut(BaseModel):
    """Bloque B: contenido generado por IA (sugerencia, NUNCA oficial).

    ``origen`` es constante ``"IA"``: deja explícita la procedencia para
    que el frontend presente este bloque como sugerencia, separado del
    resultado calculado por reglas (Style Guide §3.6/§17.2).
    """

    origen: str = "IA"
    proveedor: str
    recommendation: str
    actions: list[str]


class RecomendacionIAOut(BaseModel):
    """Respuesta de ``GET /me/progress/recommendation``.

    Separación estructural obligatoria:
    - ``resultado_actual``: bloque A, datos calculados por el sistema
      (``ResultadoActualDTO`` reutilizado tal cual: competencias con DI
      preservado, experiencia como contexto, fortalezas y oportunidades
      derivadas por reglas §17.4). La IA no puede modificarlos.
    - ``recomendacion_ia``: bloque B, sugerencia generada por el LLM.
      Puede ser ``None`` cuando la IA no está disponible (sin proveedores
      configurados o todos caídos): el bloque A se entrega igualmente y el
      cliente presenta el bloque B como no disponible. La IA es secundaria
      (PRD §17) y su fallo NUNCA elimina el resultado oficial ni se
      sustituye por una recomendación inventada.
    """

    resultado_actual: ResultadoActualDTO
    recomendacion_ia: RecomendacionIABloqueOut | None = None
