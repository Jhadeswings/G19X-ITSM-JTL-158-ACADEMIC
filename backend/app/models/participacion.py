"""Modelo Participacion.

Especificación Técnica v1.5 §9:
- Campos mínimos: id, empleado_id, proyecto_id, rol, entregables, en_equipo,
  coordino_tareas, explico_a_publico_distinto, resolvio_problema, horas,
  fecha_registro, timestamps.
- Única por combinación empleado/proyecto (UNIQUE).
- ``resolvio_problema`` es un dato contextual (§10): no lo usan
  CompetencyEngine, TalentSearchService, MentorshipService ni la IA.
- ``fecha_registro`` la usa el estado derivado "Atención requerida" (§30).
"""

from datetime import date

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin


class Participacion(TimestampMixin, Base):
    __tablename__ = "participaciones"

    id: Mapped[int] = mapped_column(primary_key=True)
    empleado_id: Mapped[int] = mapped_column(
        ForeignKey("empleados.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    proyecto_id: Mapped[int] = mapped_column(
        ForeignKey("proyectos.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    rol: Mapped[str] = mapped_column(String(255), nullable=False)
    entregables: Mapped[str | None] = mapped_column(Text, nullable=True)
    en_equipo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    coordino_tareas: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    explico_a_publico_distinto: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    # Dato contextual (§10): nunca se envía a la IA ni entra en filtros.
    resolvio_problema: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    horas: Mapped[int] = mapped_column(Integer, nullable=False)
    fecha_registro: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    empleado: Mapped["Empleado"] = relationship()
    proyecto: Mapped["Proyecto"] = relationship()

    __table_args__ = (
        # §9: única por combinación empleado/proyecto
        UniqueConstraint(
            "empleado_id",
            "proyecto_id",
            name="uq_participaciones_empleado_proyecto",
        ),
        # §33: constraint de rango estático
        CheckConstraint("horas >= 0", name="horas_no_negativas"),
    )
