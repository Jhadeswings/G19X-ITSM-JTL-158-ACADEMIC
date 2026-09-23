"""TalentSearchService: búsqueda manual de talento (PRD §13, Especificación §26).

Reglas (PRD §13.1, Especificación §26):
- AND entre TODOS los criterios: un empleado resulta solo si cumple cada
  ``code`` con ``nivel >= min_level``.
- Solo empleados ACTIVOS participan en resultados operativos.
- ``INSUFFICIENT_DATA`` no satisface ningún ``min_level`` numérico.
- ``min_level`` válido 1–5 (el estándar de producto para alto potencial
  es 4; el backend no lo restringe, PRD §13.1).

Orden (PRD §13.2): promedio informativo de las competencias seleccionadas
(desc) y, en empate, nombre ascendente y después id ascendente. Ese
promedio NO es competencia nueva, NO es ResultadoActual, NO es score
global ni ranking: es solo orden informativo y jamás se persiste.

El servicio es de SOLO LECTURA: reutiliza CompetencyEngine sin duplicar
ninguna fórmula de competencias (§13) y no escribe en la base de datos.
"""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.empleado import Empleado
from app.schemas.resultado_actual import EstadoCompetencia
from app.schemas.talent_search import (
    BusquedaManualIn,
    BusquedaManualOut,
    CompetenciaBusquedaOut,
    EmpleadoBusquedaOut,
)
from app.services.competency_engine import CompetencyEngine


class TalentSearchService:
    """Servicio de dominio de búsqueda (Especificación §26).

    Uso: ``TalentSearchService(db).search_manual(criterios)``.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    def search_manual(self, criterios: BusquedaManualIn) -> BusquedaManualOut:
        """Ejecuta el filtro backend estructurado (AND entre criterios)."""
        motor = CompetencyEngine(self.db)  # fórmulas reutilizadas, no duplicadas
        empleados = self.db.scalars(
            select(Empleado).where(Empleado.activo.is_(True))
        ).all()

        resultados: list[EmpleadoBusquedaOut] = []
        for empleado in empleados:
            # ResultadoActual en memoria (§18): nunca se persiste.
            actual = motor.calculate(empleado.id)
            por_clave = {c.clave: c for c in actual.competencias}

            cumple_todos = all(
                por_clave[criterio.code].estado == EstadoCompetencia.CALCULABLE
                and por_clave[criterio.code].nivel is not None
                and por_clave[criterio.code].nivel >= criterio.min_level
                for criterio in criterios.competencies
            )
            if not cumple_todos:
                continue  # DI o nivel insuficiente: queda fuera (PRD §13.1)

            competencias = [
                CompetenciaBusquedaOut(
                    code=criterio.code.value,
                    estado=por_clave[criterio.code].estado.value,
                    nivel=por_clave[criterio.code].nivel,
                )
                for criterio in criterios.competencies
            ]
            niveles = [
                Decimal(por_clave[criterio.code].nivel)
                for criterio in criterios.competencies
            ]
            promedio = (sum(niveles) / Decimal(len(niveles))).quantize(
                Decimal("0.01")
            )

            resultados.append(
                EmpleadoBusquedaOut(
                    empleado_id=empleado.id,
                    nombre=empleado.nombre,
                    area=empleado.area,
                    competencias=competencias,
                    promedio_seleccionadas=promedio,
                )
            )

        # PRD §13.2: promedio informativo desc; empate ⇒ nombre asc, id asc.
        resultados.sort(
            key=lambda r: (
                r.promedio_seleccionadas is None,
                -(r.promedio_seleccionadas or Decimal(0)),
                r.nombre,
                r.empleado_id,
            )
        )
        return BusquedaManualOut(
            total=len(resultados), criterios=criterios.competencies, items=resultados
        )
