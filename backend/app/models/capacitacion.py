"""Modelo Capacitacion.

Especificación Técnica v1.5 §11:
- Campos mínimos: id, empleado_id, nombre, fecha, completado, timestamps.
- La fórmula de aprendizaje usa cursos completados del año calendario local
  actual (la lógica vive en CompetencyEngine, no aquí).
"""

from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Index, String, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin


class Capacitacion(TimestampMixin, Base):
    __tablename__ = "capacitaciones"

    id: Mapped[int] = mapped_column(primary_key=True)
    empleado_id: Mapped[int] = mapped_column(
        ForeignKey("empleados.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    completado: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )

    empleado: Mapped["Empleado"] = relationship()

    __table_args__ = (
        # Soporta la fórmula de aprendizaje (§16.5) sin escaneos completos.
        Index(
            "ix_capacitaciones_empleado_completado_fecha",
            "empleado_id",
            "completado",
            "fecha",
        ),
    )
