"""Modelo Empleado.

Especificación Técnica v1.5 §5:
- Campos mínimos: id, nombre, puesto, area, fecha_ingreso, activo, timestamps.
- No guardar email duplicado (el email vive en CuentaAcceso, §4.1).
- ``puesto``, ``area`` y ``fecha_ingreso`` son nullable porque el estado
  ``profile_incomplete`` (§30) contempla que falten estos campos.
"""

from datetime import date

from sqlalchemy import Boolean, Date, String, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin


class Empleado(TimestampMixin, Base):
    __tablename__ = "empleados"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    puesto: Mapped[str | None] = mapped_column(String(255), nullable=True)
    area: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True
    )
    fecha_ingreso: Mapped[date | None] = mapped_column(Date, nullable=True)
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true(), index=True
    )

    # 1:1 opcional con CuentaAcceso (§4.1: una cuenta de empleado se
    # relaciona 1:1 con Empleado; RH puede existir sin empleado).
    cuenta: Mapped["CuentaAcceso"] = relationship(
        back_populates="empleado", uselist=False
    )
