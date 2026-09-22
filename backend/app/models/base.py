"""Componentes base para los modelos de dominio."""

from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import Mapped, mapped_column


class TimestampMixin:
    """Timestamps técnicos comunes.

    Especificación Técnica v1.5 §12: las marcas temporales se almacenan en
    UTC con tipo aware (timestamptz). La conversión a ``America/Mexico_City``
    es responsabilidad de la aplicación, nunca de la hora local del contenedor.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
