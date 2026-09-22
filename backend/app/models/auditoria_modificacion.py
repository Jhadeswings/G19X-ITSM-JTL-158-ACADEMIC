"""Modelo AuditoriaModificacion.

Especificación Técnica v1.5 §25:
- Entidad mínima: id, actor_cuenta_id, entidad, entidad_id, operacion,
  valores_anteriores JSONB nullable, valores_nuevos JSONB nullable, fecha.
- ``motivo`` nullable ("puede existir si está definido por el formulario").
- Obligatoria para correcciones RH sobre datos operativos relevantes,
  especialmente Participacion. No auditar resultados calculados dinámicos.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class AuditoriaModificacion(Base):
    __tablename__ = "auditorias_modificacion"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_cuenta_id: Mapped[int] = mapped_column(
        ForeignKey("cuentas_acceso.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    entidad: Mapped[str] = mapped_column(String(64), nullable=False)
    entidad_id: Mapped[int] = mapped_column(Integer, nullable=False)
    operacion: Mapped[str] = mapped_column(String(64), nullable=False)
    valores_anteriores: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True
    )
    valores_nuevos: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    motivo: Mapped[str | None] = mapped_column(String(512), nullable=True)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    actor_cuenta: Mapped["CuentaAcceso"] = relationship()

    __table_args__ = (
        Index("ix_auditorias_entidad_entidad_id", "entidad", "entidad_id"),
        Index("ix_auditorias_fecha", "fecha"),
    )
