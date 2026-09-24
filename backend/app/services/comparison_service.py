"""ComparisonService: comparación de empleados (PRD v1.3 §20.5).

Vista lateral DERIVADA del ResultadoActual vigente: reutiliza
``CompetencyEngine`` (único dueño de las fórmulas, §13) y los DTOs
existentes; NO usa evaluaciones históricas, NO persiste nada y NO
produce 9-Box, ganador, mejor empleado, ranking, score global ni
recomendación automática (§20.5). Sin IA: ni Groq, ni Gemini, ni
LangChain, ni AIOrchestrator participan aquí.

La experiencia es CONTEXTO (PRD §8/§20.5): se muestra (antigüedad y
proyectos únicos vía ``ExperienciaDTO`` existente) pero NO se usa para
seleccionar, ordenar ni declarar ganador. NO existe ``ExperienceScore``.

Reglas de selección (PRD §20.5 + reglas de actividad del proyecto):
- ID inexistente → 404 (patrón existente ``obtener_empleado``);
- ID existente pero INACTIVO → 422 con el patrón de validación existente
  del proyecto: la petición completa se rechaza, JAMÁS se elimina un ID
  silenciosamente (decisión documentada en DECISIONES_TECNICAS.md).

Orden: se conserva el orden de ``employee_ids`` recibido. Neutral y
determinista; evita toda clasificación implícita por promedio o nivel.
"""

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.schemas.comparacion import ComparacionOut, EmpleadoComparadoOut
from app.services.competency_engine import CompetencyEngine
from app.services.empleado_service import obtener_empleado


class ComparisonService:
    """Servicio de dominio de comparación de empleados (PRD §20.5).

    Uso: ``ComparisonService(db).compare(employee_ids)``.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    def compare(self, employee_ids: list[int]) -> ComparacionOut:
        """Compara 2+ empleados activos sobre el resultado actual."""
        # 404 si algún ID no existe (patrón existente, sin revelar más).
        empleados = {
            empleado_id: obtener_empleado(self.db, empleado_id)
            for empleado_id in employee_ids
        }

        # Inactivo ⇒ petición rechazada completa (422 patrón existente).
        # Nunca se excluye en silencio: la respuesta debe corresponder
        # EXACTAMENTE al conjunto solicitado, o no haber respuesta.
        for empleado_id, empleado in empleados.items():
            if not empleado.activo:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"El empleado {empleado_id} está inactivo y no "
                        "puede formar parte de la comparación."
                    ),
                )

        motor = CompetencyEngine(self.db)  # fórmulas reutilizadas, no duplicadas
        items: list[EmpleadoComparadoOut] = []
        for empleado_id in employee_ids:  # orden neutral: el de la petición
            empleado = empleados[empleado_id]
            actual = motor.calculate(empleado_id)
            items.append(
                EmpleadoComparadoOut(
                    empleado_id=empleado.id,
                    nombre=empleado.nombre,
                    puesto=empleado.puesto,
                    area=empleado.area,
                    competencias=actual.competencias,  # DI preservado tal cual
                    experiencia=actual.experiencia,  # contexto, nunca score
                )
            )

        return ComparacionOut(total=len(items), items=items)
