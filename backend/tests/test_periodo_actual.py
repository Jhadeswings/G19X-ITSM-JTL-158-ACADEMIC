"""Tests del periodo vigente (Fase 6, Especificación §22, PRD §16.1).

Cubre: mapeo Q1–Q4, fechas límite exactas, cambio de año, zona horaria
America/Mexico_City y el caso cercano a medianoche UTC (la zona de
negocio cambia de día antes que UTC).
"""

from datetime import date, datetime, timezone

import pytest

from app.core import fechas
from app.core.config import get_settings
from app.core.fechas import fecha_negocio_hoy, periodo_actual, periodo_de_fecha


class TestPeriodoDeFecha:
    @pytest.mark.parametrize(
        "fecha,esperado",
        [
            (date(2026, 1, 1), "2026-Q1"),  # primer día de Q1
            (date(2026, 3, 31), "2026-Q1"),  # último día de Q1
            (date(2026, 4, 1), "2026-Q2"),  # primer día de Q2
            (date(2026, 6, 30), "2026-Q2"),  # último día de Q2
            (date(2026, 7, 1), "2026-Q3"),  # primer día de Q3
            (date(2026, 9, 30), "2026-Q3"),  # último día de Q3
            (date(2026, 10, 1), "2026-Q4"),  # primer día de Q4
            (date(2026, 12, 31), "2026-Q4"),  # último día de Q4
        ],
    )
    def test_fechas_limite(self, fecha, esperado):
        assert periodo_de_fecha(fecha) == esperado

    def test_cambio_de_anio(self):
        assert periodo_de_fecha(date(2026, 12, 31)) == "2026-Q4"
        assert periodo_de_fecha(date(2027, 1, 1)) == "2027-Q1"


class TestPeriodoActual:
    def test_delega_en_fecha_de_negocio(self, monkeypatch):
        monkeypatch.setattr(fechas, "fecha_negocio_hoy", lambda: date(2026, 7, 15))
        assert periodo_actual() == "2026-Q3"

    def test_delega_en_fecha_limite(self, monkeypatch):
        monkeypatch.setattr(fechas, "fecha_negocio_hoy", lambda: date(2026, 12, 31))
        assert periodo_actual() == "2026-Q4"


class TestZonaHorariaNegocio:
    def test_zona_configurada(self):
        assert get_settings().TZ == "America/Mexico_City"

    @staticmethod
    def _fijar_utc(monkeypatch, momento_utc):
        """Sustituye ``datetime`` del módulo para congelar 'ahora' en UTC."""
        clase = type(
            "DatetimeFalso",
            (),
            {"now": staticmethod(lambda tz=None: momento_utc)},
        )
        monkeypatch.setattr(fechas, "datetime", clase)

    def test_cercano_a_medianoche_utc_anterior(self, monkeypatch):
        # 2026-01-01 05:59:59 UTC = 2025-12-31 23:59:59 en CDMX (UTC-6):
        # el día de negocio aún es 2025-12-31 ⇒ 2025-Q4.
        self._fijar_utc(monkeypatch, datetime(2026, 1, 1, 5, 59, 59, tzinfo=timezone.utc))
        assert fecha_negocio_hoy() == date(2025, 12, 31)
        assert periodo_actual() == "2025-Q4"

    def test_cercano_a_medianoche_utc_siguiente(self, monkeypatch):
        # 2026-01-01 06:00:00 UTC = 2026-01-01 00:00:00 en CDMX ⇒ 2026-Q1.
        self._fijar_utc(monkeypatch, datetime(2026, 1, 1, 6, 0, 0, tzinfo=timezone.utc))
        assert fecha_negocio_hoy() == date(2026, 1, 1)
        assert periodo_actual() == "2026-Q1"

    def test_medio_dia_utc_mismo_dia(self, monkeypatch):
        # 2026-07-01 18:00 UTC = 2026-07-01 12:00 CDMX ⇒ Q3.
        self._fijar_utc(monkeypatch, datetime(2026, 7, 1, 18, 0, 0, tzinfo=timezone.utc))
        assert fecha_negocio_hoy() == date(2026, 7, 1)
        assert periodo_actual() == "2026-Q3"
