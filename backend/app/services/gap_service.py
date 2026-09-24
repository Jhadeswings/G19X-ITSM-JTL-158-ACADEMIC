"""GapService: brechas por competencia (PRD §15, dashboard §19).

Vista DERIVADA del ResultadoActual vigente: reutiliza ``CompetencyEngine``
(único dueño de las fórmulas) y NO usa evaluaciones históricas. Una
competencia por consulta, solo empleados activos, sin score, sin ranking,
sin persistencia y sin IA.

Grupos (PRD §15):
- niveles 1–2 → grupo de brecha;
- niveles 3–5 → grupo restante;
- ``INSUFFICIENT_DATA`` → contado POR SEPARADO, fuera de ambos grupos y
  fuera del denominador de los porcentajes (nunca nivel 0, §14).

Porcentajes: ``porcentaje_decimal`` existente (Decimal 2 decimales) con
denominador = empleados evaluables. Con 0 evaluables se devuelve ``0.00``
sin división entre cero: valor neutro que el PRD prohíbe presentar como
señal de alarma automática.
"""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.empleado import Empleado
from app.schemas.brecha import BrechaOut
from app.schemas.resultado_actual import (
    ClaveCompetencia,
    EstadoCompetencia,
)
from app.core.redondeo import porcentaje_decimal
from app.services.competency_engine import CompetencyEngine

CERO = Decimal("0.00")


class GapService:
    """Servicio de dominio de brechas (PRD §15).

    Uso: ``GapService(db).obtener_brecha(competency_code)``.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    def obtener_brecha(self, competency_code: ClaveCompetencia) -> BrechaOut:
        """Distribución de niveles de UNA competencia (solo activos)."""
        motor = CompetencyEngine(self.db)  # fórmulas reutilizadas, no duplicadas
        niveles: list[int] = []
        datos_insuficientes = 0

        for empleado in self.db.scalars(
            select(Empleado).where(Empleado.activo.is_(True))
        ):
            actual = motor.calculate(empleado.id)
            competencia = next(
                c for c in actual.competencias if c.clave == competency_code
            )
            if (
                competencia.estado != EstadoCompetencia.CALCULABLE
                or competencia.nivel is None
            ):
                datos_insuficientes += 1  # fuera de ambos grupos (§14/§15)
            else:
                niveles.append(competencia.nivel)

        nivel_1_2 = sum(1 for nivel in niveles if nivel <= 2)
        nivel_3_5 = sum(1 for nivel in niveles if nivel >= 3)
        evaluables = len(niveles)

        return BrechaOut(
            competency_code=competency_code,
            evaluables=evaluables,
            datos_insuficientes=datos_insuficientes,
            nivel_1_2_count=nivel_1_2,
            nivel_1_2_percentage=(
                porcentaje_decimal(nivel_1_2, evaluables)
                if evaluables
                else CERO
            ),
            nivel_3_5_count=nivel_3_5,
            nivel_3_5_percentage=(
                porcentaje_decimal(nivel_3_5, evaluables)
                if evaluables
                else CERO
            ),
        )