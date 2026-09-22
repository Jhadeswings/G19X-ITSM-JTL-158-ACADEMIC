"""Modelo CuentaAcceso.

Especificación Técnica v1.5 §4:
- ``empleado_id`` nullable y UNIQUE cuando exista (RH puede existir sin empleado).
- ``rol`` restringido a RH | EMPLEADO.
- ``email`` único de forma case-insensitive (§4.1): índice UNIQUE funcional
  sobre ``lower(email)``. La normalización en aplicación llega con la fase
  de autenticación.
- Nunca almacenar contraseñas en texto plano (password_hash).
"""

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    String,
    false,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import text

from app.core.db import Base
from app.models.base import TimestampMixin


class CuentaAcceso(TimestampMixin, Base):
    __tablename__ = "cuentas_acceso"

    id: Mapped[int] = mapped_column(primary_key=True)
    empleado_id: Mapped[int | None] = mapped_column(
        ForeignKey("empleados.id", ondelete="RESTRICT"),
        unique=True,
        nullable=True,
        index=True,
    )
    rol: Mapped[str] = mapped_column(String(16), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )

    empleado: Mapped["Empleado | None"] = relationship(back_populates="cuenta")

    __table_args__ = (
        CheckConstraint("rol IN ('RH', 'EMPLEADO')", name="rol_valido"),
        # Unicidad case-insensitive del email (§4.1)
        Index("uq_cuentas_acceso_email_ci", text("lower(email)"), unique=True),
    )
