"""MentorshipService: sugerencia de mentor por reglas (PRD §14, ET §29).

Selección 100% determinista y SIN IA (§29.3): ni Groq, ni Gemini ni
LangChain participan aquí. El servicio reutiliza ``CompetencyEngine``
(único dueño de las fórmulas, §13) y trabaja sobre el ResultadoActual
vigente en memoria: JAMÁS usa evaluaciones históricas como fuente de
niveles y JAMÁS persiste sugerencias, rankings ni relaciones.

Reglas (PRD §14.1–§14.3 / ET §29.1–§29.3):
- Receptor: activo + competencia objetivo calculable; nivel 1–4 elegible,
  nivel 5 sin sugerencia, ``INSUFFICIENT_DATA`` sin sugerencia.
- Mentor: activo + nivel numérico objetivo estrictamente superior al del
  receptor. NO se usan experiencia, antigüedad, número de proyectos,
  ``resolvio_problema``, score global, 9-Box ni evaluaciones históricas.
- Desempate exacto: mayor nivel objetivo → mayor promedio de las otras
  cuatro competencias (SOLO valores numéricos; DI se excluye, nunca se
  convierte en cero) → nombre ascendente → id ascendente.

El promedio de desempate se compara con ``Fraction`` (racional exacto):
sin redondeo y sin errores de flotante (§14.3 determinismo). Un mentor
sin NINGÚN valor numérico en las otras cuatro queda debajo de cualquier
promedio numérico (los niveles son 1–5, siempre > 0) y pasa directo al
desempate por nombre, como exige el PRD.
"""

from fractions import Fraction

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.empleado import Empleado
from app.schemas.mentoria import MentorOut, SugerenciaMentoriaOut
from app.schemas.resultado_actual import (
    ClaveCompetencia,
    CompetenciaResultadoDTO,
    EstadoCompetencia,
    ResultadoActualDTO,
)
from app.services.competency_engine import CompetencyEngine

CRITERIO = "Criterio del sistema"


class MentorshipService:
    """Servicio de dominio de mentoría (Especificación §29).

    Uso: ``MentorshipService(db).suggest(receiver_id, competency_code)``.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    # ------------------------------------------------------------------
    # Utilidades internas (reutilizan CompetencyEngine, no duplican fórmulas)
    # ------------------------------------------------------------------
    @staticmethod
    def _competencia(
        actual: ResultadoActualDTO, clave: ClaveCompetencia
    ) -> CompetenciaResultadoDTO:
        """Devuelve el ``CompetenciaResultadoDTO`` de ``clave``."""
        for competencia in actual.competencias:
            if competencia.clave == clave:
                return competencia
        raise LookupError(f"Competencia {clave} no encontrada.")  # pragma: no cover

    @classmethod
    def _promedio_otras_numericas(
        cls, actual: ResultadoActualDTO, clave: ClaveCompetencia
    ) -> Fraction:
        """Promedio EXACTO de las otras cuatro competencias (solo numéricas).

        ``INSUFFICIENT_DATA`` se EXCLUYE (no se convierte en cero, §14.3).
        Sin ningún valor numérico devuelve 0, que ordena por debajo de
        cualquier promedio real (niveles 1–5) y deja el empate al
        desempate por nombre/id.
        """
        niveles = [
            competencia.nivel
            for competencia in actual.competencias
            if competencia.clave != clave
            and competencia.estado == EstadoCompetencia.CALCULABLE
            and competencia.nivel is not None
        ]
        if not niveles:
            return Fraction(0)
        return Fraction(sum(niveles), len(niveles))

    # ------------------------------------------------------------------
    # Punto de entrada (§29)
    # ------------------------------------------------------------------
    def suggest(
        self, receiver_id: int, competency_code: ClaveCompetencia
    ) -> SugerenciaMentoriaOut:
        """Sugiere mentor para el receptor en la competencia objetivo."""
        receptor = self.db.get(Empleado, receiver_id)
        if receptor is None:
            raise LookupError(f"Empleado {receiver_id} no encontrado.")

        motor = CompetencyEngine(self.db)  # fórmulas reutilizadas, no duplicadas
        objetivo_receiver = self._competencia(
            motor.calculate(receiver_id), competency_code
        )
        nivel_receiver = objetivo_receiver.nivel  # None si DI

        # §14.1/§29.1: elegibilidad del receptor.
        if not receptor.activo:
            return SugerenciaMentoriaOut(
                receiver_id=receiver_id,
                competency_code=competency_code.value,
                nivel_receiver=nivel_receiver,
                elegible=False,
                mentor=None,
                criterio_del_sistema=(
                    f"{CRITERIO}: el receptor no es un empleado activo; "
                    "no se sugiere mentor."
                ),
            )
        if objetivo_receiver.estado != EstadoCompetencia.CALCULABLE:
            return SugerenciaMentoriaOut(
                receiver_id=receiver_id,
                competency_code=competency_code.value,
                nivel_receiver=None,
                elegible=False,
                mentor=None,
                criterio_del_sistema=(
                    f"{CRITERIO}: la competencia {competency_code.value} del "
                    "receptor está en Datos insuficientes; no se sugiere mentor."
                ),
            )
        if nivel_receiver == 5:
            return SugerenciaMentoriaOut(
                receiver_id=receiver_id,
                competency_code=competency_code.value,
                nivel_receiver=5,
                elegible=False,
                mentor=None,
                criterio_del_sistema=(
                    f"{CRITERIO}: el receptor tiene nivel 5 en "
                    f"{competency_code.value}; no se sugiere mentor."
                ),
            )

        # §14.2/§29.2: candidatos a mentor (activos con nivel estrictamente
        # superior). El propio receptor queda fuera: su nivel no puede ser
        # estrictamente superior a sí mismo.
        mejor_clave = None
        mentor: MentorOut | None = None
        for candidato in self.db.scalars(
            select(Empleado).where(
                Empleado.activo.is_(True), Empleado.id != receiver_id
            )
        ):
            actual = motor.calculate(candidato.id)
            objetivo = self._competencia(actual, competency_code)
            if (
                objetivo.estado != EstadoCompetencia.CALCULABLE
                or objetivo.nivel is None
                or objetivo.nivel <= nivel_receiver
            ):
                continue  # inactivo ya filtrado; DI o nivel no superior: fuera
            clave_orden = (
                -objetivo.nivel,
                -self._promedio_otras_numericas(actual, competency_code),
                candidato.nombre,
                candidato.id,
            )
            if mejor_clave is None or clave_orden < mejor_clave:
                mejor_clave = clave_orden
                mentor = MentorOut(
                    empleado_id=candidato.id,
                    nombre=candidato.nombre,
                    nivel=objetivo.nivel,
                )

        if mentor is None:
            return SugerenciaMentoriaOut(
                receiver_id=receiver_id,
                competency_code=competency_code.value,
                nivel_receiver=nivel_receiver,
                elegible=True,
                mentor=None,
                criterio_del_sistema=(
                    f"{CRITERIO}: ningún empleado activo tiene nivel numérico "
                    f"en {competency_code.value} estrictamente superior al "
                    f"nivel {nivel_receiver} del receptor."
                ),
            )

        return SugerenciaMentoriaOut(
            receiver_id=receiver_id,
            competency_code=competency_code.value,
            nivel_receiver=nivel_receiver,
            elegible=True,
            mentor=mentor,
            criterio_del_sistema=(
                f"{CRITERIO}: empleado activo con nivel {mentor.nivel} en "
                f"{competency_code.value}, estrictamente superior al nivel "
                f"{nivel_receiver} del receptor. Orden determinista: mayor "
                "nivel en la competencia objetivo, mayor promedio de las "
                "otras cuatro competencias (solo valores numéricos, Datos "
                "insuficientes excluidos), nombre ascendente e id ascendente."
            ),
        )