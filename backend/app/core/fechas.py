"""Fechas de negocio (Especificación Técnica §12).

La zona horaria de negocio es ``America/Mexico_City`` (settings.TZ). Las
fechas de negocio (p.ej. ``Participacion.fecha_registro``) deben calcularse
convirtiendo UTC a la zona de negocio: NUNCA usar la hora local del
contenedor como fuente de lógica de negocio.
"""

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from app.core.config import get_settings


def fecha_negocio_hoy() -> date:
    """Fecha de 'hoy' en la zona de negocio, calculada desde UTC (§12)."""
    zona_negocio = ZoneInfo(get_settings().TZ)
    return datetime.now(timezone.utc).astimezone(zona_negocio).date()


def periodo_de_fecha(fecha: date) -> str:
    """Periodo trimestral ``YYYY-QN`` de una fecha de negocio (§22, PRD §16.1).

    Mapeo estático en la aplicación (NUNCA ``CURRENT_DATE`` de PostgreSQL):
    01–03 → Q1, 04–06 → Q2, 07–09 → Q3, 10–12 → Q4.
    """
    return f"{fecha.year}-Q{(fecha.month - 1) // 3 + 1}"


def periodo_actual() -> str:
    """Periodo vigente según la fecha de negocio (America/Mexico_City, §22)."""
    return periodo_de_fecha(fecha_negocio_hoy())
