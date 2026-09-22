"""Modelo Proyecto.

Especificación Técnica v1.5 §6–§8:
- ``nombre_normalizado`` con UNIQUE (§6.1), generado por la función canónica
  de normalización (§7) en la aplicación.
- ``estado`` restringido a EN_PROCESO | COMPLETADO | CANCELADO; un proyecto
  nuevo creado por Empleado inicia en EN_PROCESO (§6).
- ``cliente`` nullable ("cuando aplique al modelo de producto").
- Índice GIN trigram sobre ``nombre_normalizado`` para la coincidencia
  aproximada (§8, §33). La extensión pg_trgm se habilita en la migración.
"""

from sqlalchemy import CheckConstraint, Index, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import text

from app.core.db import Base
from app.models.base import TimestampMixin


class Proyecto(TimestampMixin, Base):
    __tablename__ = "proyectos"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    nombre_normalizado: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True
    )
    area: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True
    )
    cliente: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # §6: el proyecto nuevo creado por un Empleado inicia en EN_PROCESO
    estado: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="EN_PROCESO",
        server_default="EN_PROCESO",
        index=True,
    )

    __table_args__ = (
        CheckConstraint(
            "estado IN ('EN_PROCESO', 'COMPLETADO', 'CANCELADO')",
            name="estado_valido",
        ),
        # Índice de similitud para búsqueda aproximada (§8, §33)
        Index(
            "ix_proyectos_nombre_normalizado_trgm",
            text("nombre_normalizado gin_trgm_ops"),
            postgresql_using="gin",
        ),
    )
