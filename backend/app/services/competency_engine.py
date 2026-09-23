"""CompetencyEngine: motor central de competencias (Fase 5).

Especificación Técnica v1.5 §13–§19 y PRD v1.3:
- Único dueño de las fórmulas: prohibido duplicarlas en routers,
  componentes React o consultas independientes (§13).
- Sin IA dentro del motor (§13).
- ``resolvio_problema`` es dato contextual (§10): no se consulta aquí para
  ninguna fórmula, fortaleza ni oportunidad.
- La experiencia es contexto (§17): no es competencia ni clasifica.
- ``ResultadoActual`` vive SOLO en memoria (§18): este servicio es de
  solo lectura, jamás escribe en la base de datos.

Regla de autoridad para la condición mínima de aprendizaje: el PRD manda
("2 cursos registrados, o 3 proyectos registrados" = registros de
Capacitacion sin importar ``completado``), mientras que el Componente B
cuenta exclusivamente cursos ``completado=true`` del año calendario local
actual (Especificación §16.5). Son dos conteos INDEPENDIENTES.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.fechas import fecha_negocio_hoy
from app.core.redondeo import porcentaje_a_nivel, porcentaje_decimal, round_half_up
from app.models.capacitacion import Capacitacion
from app.models.empleado import Empleado
from app.models.participacion import Participacion
from app.models.proyecto import Proyecto
from app.schemas.resultado_actual import (
    ClaveCompetencia,
    CompetenciaResultadoDTO,
    EstadoCompetencia,
    ExperienciaDTO,
    ResultadoActualDTO,
)

ESTADO_COMPLETADO = "COMPLETADO"
ESTADO_CANCELADO = "CANCELADO"
ESTADO_EN_PROCESO = "EN_PROCESO"

# Días promedio del año gregoriano para la antigüedad contextual (§17).
_DIAS_POR_ANIO = Decimal("365.2425")


def _escala_roles(roles_distintos: int) -> int:
    """Componente A (§16.5): 0→1, 1→2, 2→3, 3→4, 4+→5."""
    return 5 if roles_distintos >= 4 else roles_distintos + 1


def _escala_cursos(cursos_completados: int) -> int:
    """Componente B (§16.5): 0–1→1, 2–3→2, 4–5→3, 6–7→4, 8+→5."""
    if cursos_completados <= 1:
        return 1
    if cursos_completados <= 3:
        return 2
    if cursos_completados <= 5:
        return 3
    if cursos_completados <= 7:
        return 4
    return 5


class CompetencyEngine:
    """Servicio centralizado y reutilizable (§13).

    Uso: ``CompetencyEngine(db).calculate(empleado_id)``. La sesión se
    inyecta en el constructor; ``calculate`` es de solo lectura.
    """

    # §16.1: denominador mínimo de proyectos evaluables (COMPLETADO+CANCELADO).
    MIN_PROYECTOS_EVALUABLES = 3
    # §16.2–§16.4: mínimo 3 participaciones para liderazgo/equipo/comunicación.
    MIN_PARTICIPACIONES = 3
    # PRD: condición mínima de aprendizaje = 2 capacitaciones REGISTRADAS...
    MIN_CAPACITACIONES_REGISTRADAS = 2
    # ...O 3 proyectos únicos registrados.
    MIN_PROYECTOS_UNICOS = 3
    # §16.5: pesos del score de aprendizaje.
    PESO_COMPONENTE_A = Decimal("0.60")
    PESO_COMPONENTE_B = Decimal("0.40")

    def __init__(self, db: Session) -> None:
        self.db = db

    # ------------------------------------------------------------------
    # Punto de entrada (§13)
    # ------------------------------------------------------------------
    def calculate(self, empleado_id: int) -> ResultadoActualDTO:
        """Calcula el ResultadoActual en memoria para un empleado.

        Lanza ``LookupError`` si el empleado no existe (el router que se
        agregue en fases posteriores la mapeará a 404).
        """
        empleado = self.db.get(Empleado, empleado_id)
        if empleado is None:
            raise LookupError(f"Empleado {empleado_id} no encontrado.")

        competencias = [
            self._desempeno_tecnico(empleado_id),
            self._indicador_booleano(
                empleado_id,
                campo=Participacion.coordino_tareas,
                clave=ClaveCompetencia.LIDERAZGO,
                nombre_evidencia="coordino_tareas_true",
            ),
            self._indicador_booleano(
                empleado_id,
                campo=Participacion.en_equipo,
                clave=ClaveCompetencia.TRABAJO_EQUIPO,
                nombre_evidencia="en_equipo_true",
            ),
            self._indicador_booleano(
                empleado_id,
                campo=Participacion.explico_a_publico_distinto,
                clave=ClaveCompetencia.COMUNICACION,
                nombre_evidencia="explico_a_publico_distinto_true",
            ),
            self._aprendizaje(empleado_id),
        ]
        experiencia = self._experiencia(empleado)

        # §19: clasificación determinista (nivel 4–5 fuerza, 1–2 oportunidad,
        # 3 ninguna, INSUFFICIENT_DATA excluida). Sin IA, sin experiencia.
        fortalezas = [
            c.clave for c in competencias if c.nivel is not None and c.nivel >= 4
        ]
        oportunidades = [
            c.clave for c in competencias if c.nivel is not None and c.nivel <= 2
        ]

        return ResultadoActualDTO(
            empleado_id=empleado_id,
            competencias=competencias,
            experiencia=experiencia,
            fortalezas=fortalezas,
            oportunidades=oportunidades,
        )

    # ------------------------------------------------------------------
    # §16.1 Desempeño técnico
    # ------------------------------------------------------------------
    def _desempeno_tecnico(self, empleado_id: int) -> CompetenciaResultadoDTO:
        filas = self.db.execute(
            select(Proyecto.estado, func.count())
            .select_from(Participacion)
            .join(Proyecto, Proyecto.id == Participacion.proyecto_id)
            .where(Participacion.empleado_id == empleado_id)
            .group_by(Proyecto.estado)
        ).all()
        conteos = {estado: int(total or 0) for estado, total in filas}
        completados = conteos.get(ESTADO_COMPLETADO, 0)
        cancelados = conteos.get(ESTADO_CANCELADO, 0)
        en_proceso = conteos.get(ESTADO_EN_PROCESO, 0)
        evaluables = completados + cancelados

        evidencia = {
            "proyectos_completados": completados,
            "proyectos_cancelados": cancelados,
            "proyectos_evaluables": evaluables,
            "proyectos_en_proceso_excluidos": en_proceso,
        }
        if evaluables < self.MIN_PROYECTOS_EVALUABLES:
            return CompetenciaResultadoDTO(
                clave=ClaveCompetencia.DESEMPENO_TECNICO,
                estado=EstadoCompetencia.INSUFFICIENT_DATA,
                nivel=None,
                valor=None,
                evidencia=evidencia,
            )
        return CompetenciaResultadoDTO(
            clave=ClaveCompetencia.DESEMPENO_TECNICO,
            estado=EstadoCompetencia.CALCULABLE,
            nivel=porcentaje_a_nivel(completados, evaluables),
            valor=porcentaje_decimal(completados, evaluables),
            evidencia=evidencia,
        )

    # ------------------------------------------------------------------
    # §16.2–§16.4 Liderazgo / Trabajo en equipo / Comunicación
    # ------------------------------------------------------------------
    def _indicador_booleano(
        self,
        empleado_id: int,
        *,
        campo,
        clave: ClaveCompetencia,
        nombre_evidencia: str,
    ) -> CompetenciaResultadoDTO:
        total = int(
            self.db.scalar(
                select(func.count())
                .select_from(Participacion)
                .where(Participacion.empleado_id == empleado_id)
            )
            or 0
        )
        verdaderos = int(
            self.db.scalar(
                select(func.count())
                .select_from(Participacion)
                .where(
                    Participacion.empleado_id == empleado_id,
                    campo.is_(True),
                )
            )
            or 0
        )

        evidencia = {"participaciones": total, nombre_evidencia: verdaderos}
        if total < self.MIN_PARTICIPACIONES:
            return CompetenciaResultadoDTO(
                clave=clave,
                estado=EstadoCompetencia.INSUFFICIENT_DATA,
                nivel=None,
                valor=None,
                evidencia=evidencia,
            )
        return CompetenciaResultadoDTO(
            clave=clave,
            estado=EstadoCompetencia.CALCULABLE,
            nivel=porcentaje_a_nivel(verdaderos, total),
            valor=porcentaje_decimal(verdaderos, total),
            evidencia=evidencia,
        )

    # ------------------------------------------------------------------
    # §16.5 Capacidad de aprendizaje
    # ------------------------------------------------------------------
    def _aprendizaje(self, empleado_id: int) -> CompetenciaResultadoDTO:
        roles_distintos = int(
            self.db.scalar(
                select(func.count(func.distinct(Participacion.rol)))
                .select_from(Participacion)
                .where(Participacion.empleado_id == empleado_id)
            )
            or 0
        )
        proyectos_unicos = int(
            self.db.scalar(
                select(func.count(func.distinct(Participacion.proyecto_id)))
                .select_from(Participacion)
                .where(Participacion.empleado_id == empleado_id)
            )
            or 0
        )
        # Condición mínima según PRD: registros de Capacitacion (sin importar
        # ``completado``) >= 2 O proyectos únicos registrados >= 3.
        capacitaciones_registradas = int(
            self.db.scalar(
                select(func.count())
                .select_from(Capacitacion)
                .where(Capacitacion.empleado_id == empleado_id)
            )
            or 0
        )

        evidencia: dict[str, int | str | Decimal] = {
            "roles_distintos": roles_distintos,
            "proyectos_unicos": proyectos_unicos,
            "capacitaciones_registradas": capacitaciones_registradas,
        }

        condicion_minima = (
            capacitaciones_registradas >= self.MIN_CAPACITACIONES_REGISTRADAS
            or proyectos_unicos >= self.MIN_PROYECTOS_UNICOS
        )
        if not condicion_minima:
            evidencia["minimo_capacitaciones"] = self.MIN_CAPACITACIONES_REGISTRADAS
            evidencia["minimo_proyectos_unicos"] = self.MIN_PROYECTOS_UNICOS
            return CompetenciaResultadoDTO(
                clave=ClaveCompetencia.APRENDIZAJE,
                estado=EstadoCompetencia.INSUFFICIENT_DATA,
                nivel=None,
                valor=None,
                evidencia=evidencia,
            )

        # Componente B (Especificación §16.5): SOLO cursos completados cuyo
        # ``fecha`` pertenezca al año calendario local actual (§12).
        anio = fecha_negocio_hoy().year
        cursos_anio = int(
            self.db.scalar(
                select(func.count())
                .select_from(Capacitacion)
                .where(
                    Capacitacion.empleado_id == empleado_id,
                    Capacitacion.completado.is_(True),
                    Capacitacion.fecha >= date(anio, 1, 1),
                    Capacitacion.fecha <= date(anio, 12, 31),
                )
            )
            or 0
        )

        componente_a = _escala_roles(roles_distintos)
        componente_b = _escala_cursos(cursos_anio)
        score = (
            Decimal(componente_a) * self.PESO_COMPONENTE_A
            + Decimal(componente_b) * self.PESO_COMPONENTE_B
        )

        evidencia.update(
            {
                "anio_calendario": anio,
                "cursos_completados_anio": cursos_anio,
                "componente_a_roles": componente_a,
                "componente_b_cursos": componente_b,
                "score": score.quantize(Decimal("0.01")),
            }
        )
        return CompetenciaResultadoDTO(
            clave=ClaveCompetencia.APRENDIZAJE,
            estado=EstadoCompetencia.CALCULABLE,
            nivel=round_half_up(score),
            valor=score.quantize(Decimal("0.01")),
            evidencia=evidencia,
        )

    # ------------------------------------------------------------------
    # §17 Experiencia (contexto, NO competencia)
    # ------------------------------------------------------------------
    def _experiencia(self, empleado: Empleado) -> ExperienciaDTO:
        proyectos_unicos = int(
            self.db.scalar(
                select(func.count(func.distinct(Participacion.proyecto_id)))
                .select_from(Participacion)
                .where(Participacion.empleado_id == empleado.id)
            )
            or 0
        )
        anios: Decimal | None = None
        if empleado.fecha_ingreso is not None:
            dias = (fecha_negocio_hoy() - empleado.fecha_ingreso).days
            # Una fecha de ingreso futura se trata como antigüedad cero.
            anios = (Decimal(max(dias, 0)) / _DIAS_POR_ANIO).quantize(
                Decimal("0.01")
            )
        return ExperienciaDTO(
            fecha_ingreso=empleado.fecha_ingreso,
            anios_antiguedad=anios,
            proyectos_unicos=proyectos_unicos,
        )
