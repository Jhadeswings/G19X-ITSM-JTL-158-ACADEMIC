"""ResultadoActualService: resultado actual vigente de UN empleado (RH).

Especificación Técnica v1.5 §13, §18, §31/§32; PRD v1.3 §20.2 y §42.

- Expone el ResultadoActual DERIVADO del estado actual de la base de datos
  para el bloque "Resultado actual" del perfil individual de RH (PRD §20.2).
  Ese bloque se presenta ANTES del histórico de evaluaciones (§42), nunca en
  su lugar ni sustituido por él.
- Reutiliza ``CompetencyEngine`` tal cual (§13: único dueño de las fórmulas):
  aquí no se duplica ninguna fórmula y ``INSUFFICIENT_DATA`` se preserva
  (``nivel=None``, jamás 0, §14).
- ``ResultadoActual`` vive SOLO en memoria (§18 y §44): este servicio es de
  solo lectura; sin tabla, sin modelo, sin histórico y sin cache.
- Sin IA: es el resultado OFICIAL del sistema, no una sugerencia. No
  participan Groq, Gemini, LangChain ni AIOrchestrator.
- Las evaluaciones históricas NO alteran la respuesta: el histórico es un
  snapshot inmutable (§21/§24) y el resultado actual se deriva de las
  participaciones y capacitaciones vigentes.
- El 9-Box NO forma parte de este contrato: se calcula al generar la
  evaluación (§20/§23) y se lee del histórico; aquí no se recalcula.

Sin reglas especiales por estado del empleado: el PRD y la Especificación NO
definen condiciones de acceso ligadas a ``Empleado.activo`` para el
ResultadoActual, así que el contrato permanece NEUTRAL respecto a ese estado.
La única respuesta especial es la inexistencia del empleado (404 mediante el
patrón existente ``obtener_empleado``).
"""

from sqlalchemy.orm import Session

from app.schemas.resultado_actual import ResultadoActualDTO
from app.services.competency_engine import CompetencyEngine
from app.services.empleado_service import obtener_empleado


def obtener_resultado_actual(db: Session, empleado_id: int) -> ResultadoActualDTO:
    """Resultado actual vigente del empleado indicado (solo lectura).

    El ``empleado_id`` proviene de la ruta decidida por el backend (RH
    autenticado, ET §31): el cliente nunca envía niveles, fortalezas,
    oportunidades ni experiencia.
    """
    obtener_empleado(db, empleado_id)  # 404 si el empleado no existe

    # Motor reutilizado (§13): cero fórmulas duplicadas en este servicio.
    return CompetencyEngine(db).calculate(empleado_id)
