"""AttentionService: Atención requerida (PRD §19.1, Especificación §30).

Vista DERIVADA: NO existe tabla ni modelo ``Alert`` (§30), la consulta no
modifica datos, no altera competencias, 9-Box ni evaluaciones, y no
genera auditoría ni persistencia de ningún tipo.

Condiciones exactas (ET §30) para un empleado ACTIVO:
- ``PERFIL_INCOMPLETO``: falta nombre, cuenta/correo de acceso, puesto,
  área o fecha de ingreso (PRD §19.1);
- ``SIN_PARTICIPACION_RECIENTE``: no tiene ninguna participación con
  ``fecha_registro >= hoy_negocio - 90 días``.

La fecha límite se calcula con ``fecha_negocio_hoy`` (America/Mexico_City
desde UTC, §12; NUNCA la hora local del contenedor ni fecha UTC sin
convertir). Se usa ``Participacion.fecha_registro`` (§30): jamás
``created_at`` técnico, ni última evaluación, ni niveles de competencia.

Los motivos viajan como códigos estructurados neutrales: orientación
operativa, no juicio ("problema", "mal empleado", "bajo desempeño" y
"alerta humana" están prohibidos, PRD §19.1/§23).
"""

from datetime import timedelta

from sqlalchemy import exists, select
from sqlalchemy.orm import Session, joinedload

from app.core.fechas import fecha_negocio_hoy
from app.models.empleado import Empleado
from app.models.participacion import Participacion
from app.schemas.atencion import (
    AtencionRequeridaOut,
    EmpleadoAtencionOut,
    MotivoAtencion,
)

# PRD §19.1: ventana de recencia de participaciones.
DIAS_RECENCIA = 90


class AttentionService:
    """Servicio derivado de Atención requerida (Especificación §30).

    Uso: ``AttentionService(db).get_required_attention()``.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    def _perfil_incompleto(self, empleado: Empleado) -> bool:
        """PRD §19.1: falta nombre, correo de acceso, puesto, área o
        fecha de ingreso."""
        cuenta = empleado.cuenta
        return bool(
            not (empleado.nombre and empleado.nombre.strip())
            or cuenta is None
            or not cuenta.email.strip()
            or empleado.puesto is None
            or empleado.area is None
            or empleado.fecha_ingreso is None
        )

    def _tiene_participacion_reciente(
        self, empleado_id: int, limite: object
    ) -> bool:
        """¿Existe alguna participación con ``fecha_registro >= límite``?"""
        return bool(
            self.db.scalar(
                select(
                    exists().where(
                        Participacion.empleado_id == empleado_id,
                        Participacion.fecha_registro >= limite,
                    )
                )
            )
        )

    def get_required_attention(self) -> AtencionRequeridaOut:
        """Empleados activos que cumplen al menos una condición (§30)."""
        limite = fecha_negocio_hoy() - timedelta(days=DIAS_RECENCIA)
        items: list[EmpleadoAtencionOut] = []

        for empleado in self.db.scalars(
            select(Empleado)
            .options(joinedload(Empleado.cuenta))
            .where(Empleado.activo.is_(True))
        ):
            motivos: list[MotivoAtencion] = []
            if self._perfil_incompleto(empleado):
                motivos.append(MotivoAtencion.PERFIL_INCOMPLETO)
            if not self._tiene_participacion_reciente(empleado.id, limite):
                motivos.append(MotivoAtencion.SIN_PARTICIPACION_RECIENTE)
            if motivos:  # al menos una condición → aparece UNA sola vez
                items.append(
                    EmpleadoAtencionOut(
                        empleado_id=empleado.id,
                        nombre=empleado.nombre,
                        motivos=motivos,
                    )
                )

        # Orden determinista informativo: nombre asc, id asc.
        items.sort(key=lambda item: (item.nombre, item.empleado_id))
        return AtencionRequeridaOut(total=len(items), items=items)