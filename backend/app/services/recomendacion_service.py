"""RecommendationService: recomendaciones de desarrollo con IA (PRD §17.2).

Consulta DERIVADA y efímera: se calcula sobre el ResultadoActual vigente
del propio empleado (``CompetencyEngine``, único dueño de las fórmulas)
y se pide una sugerencia al ``AIOrchestrator`` (Groq → Gemini). NO se
persiste nada: sin tabla de recomendaciones, sin histórico, sin modelo,
sin auditoría y sin cache persistente (lectura, ET §25).

Contexto enviado al LLM (PRD §18, mínimo estricto):
- por competencia: código + nivel 1–5 o estado INSUFFICIENT_DATA;
- fortalezas y oportunidades YA calculadas por reglas (§17.4);
- experiencia SOLO como contexto (años de antigüedad y proyectos
  únicos): nunca como fórmula de talento ni para cambiar niveles.

NUNCA se envían: nombre, correo, employee_id, ``resolvio_problema``,
texto libre de participaciones, entregables, situaciones descritas,
evaluaciones históricas ni datos de otros empleados.

La IA no puede modificar el resultado: las competencias, fortalezas y
oportunidades de la respuesta salen del engine, y el bloque IA viaja
separado y con procedencia explícita (Style Guide §3.6).
"""

from sqlalchemy.orm import Session

from app.schemas.recomendacion_ia import (
    RecomendacionIABloqueOut,
    RecomendacionIAOut,
)
from app.schemas.resultado_actual import ResultadoActualDTO
from app.services.ai.ai_orchestrator import AIOrchestrator
from app.services.competency_engine import CompetencyEngine
from app.services.empleado_service import obtener_empleado


class RecommendationService:
    """Servicio de recomendaciones de desarrollo (PRD §17.2, §21.2).

    Uso: ``RecommendationService(db).obtener(empleado_id, orchestrator)``.
    El ``empleado_id`` SIEMPRE lo deriva el router del token (§32).
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    @staticmethod
    def _contexto_minimo(actual: ResultadoActualDTO) -> dict:
        """Contexto estrictamente necesario para una sugerencia útil.

        Sin PII, sin evidencia interna, sin valores numéricos de fórmula:
        solo códigos, niveles/estados y las categorías ya calculadas.
        """
        antiguedad = actual.experiencia.anios_antiguedad
        return {
            "competencias": [
                {
                    "codigo": competencia.clave.value,
                    "nivel": competencia.nivel,  # None ⇒ INSUFFICIENT_DATA
                    "estado": competencia.estado.value,
                }
                for competencia in actual.competencias
            ],
            "fortalezas": [clave.value for clave in actual.fortalezas],
            "oportunidades": [clave.value for clave in actual.oportunidades],
            # Contexto únicamente (PRD §8): nunca regla de talento.
            "experiencia": {
                "anios_antiguedad": (
                    int(antiguedad) if antiguedad is not None else None
                ),
                "proyectos_unicos": actual.experiencia.proyectos_unicos,
            },
        }

    def obtener(
        self, empleado_id: int, orchestrator: AIOrchestrator
    ) -> RecomendacionIAOut:
        """Resultado actual (reglas) + sugerencia IA separada y explícita."""
        obtener_empleado(self.db, empleado_id)  # 404 si no existe
        actual = CompetencyEngine(self.db).calculate(empleado_id)

        salida, proveedor = orchestrator.generar_recomendacion(
            self._contexto_minimo(actual)
        )

        return RecomendacionIAOut(
            resultado_actual=actual,  # bloque A: dato del sistema, inmutable por IA
            recomendacion_ia=RecomendacionIABloqueOut(  # bloque B: sugerencia
                proveedor=proveedor,
                recommendation=salida.recommendation,
                actions=salida.actions,
            ),
        )
