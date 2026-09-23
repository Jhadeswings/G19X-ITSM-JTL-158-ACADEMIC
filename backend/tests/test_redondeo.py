"""Tests unitarios de las utilidades matemáticas (Fase 5, §15–§16.5).

Cubren ROUND_HALF_UP (incluidos los casos .5, que Python ``round()``
redondearía bancariamente) y la conversión porcentaje → nivel con
límites exactos 20/40/60/80 e inmediatamente superiores.
"""

from decimal import Decimal

import pytest

from app.core.redondeo import porcentaje_a_nivel, porcentaje_decimal, round_half_up


class TestRoundHalfUp:
    @pytest.mark.parametrize(
        ("valor", "esperado"),
        [
            # Casos .5: mitad-hacia-arriba, NO redondeo bancario.
            (Decimal("0.5"), 1),
            (Decimal("1.5"), 2),
            (Decimal("2.5"), 3),  # round(2.5) de Python daría 2
            (Decimal("3.5"), 4),  # round(3.5) de Python daría 4, pero por banker's
            (Decimal("4.5"), 5),  # round(4.5) de Python daría 4
            (Decimal("-0.5"), -1),
            (Decimal("-2.5"), -3),
            # Valores por debajo y por encima de .5.
            (Decimal("2.4"), 2),
            (Decimal("2.6"), 3),
            (Decimal("2.49"), 2),
            # Enteros y flotantes (vía str, sin ruido binario).
            (2, 2),
            (2.5, 3),
            ("3.5", 4),
        ],
    )
    def test_round_half_up(self, valor, esperado):
        assert round_half_up(valor) == esperado

    def test_round_no_es_fuente(self):
        """Sanity: Python round() NO cumple HALF_UP; nuestra utilidad sí."""
        assert round(2.5) == 2  # comportamiento bancario (lo rechazado)
        assert round_half_up(2.5) == 3


class TestPorcentajeANivel:
    @pytest.mark.parametrize(
        ("numerador", "denominador", "esperado"),
        [
            # Límites exactos (inclusive): 20→1, 40→2, 60→3, 80→4 (§15).
            (0, 100, 1),   # 0 %
            (20, 100, 1),  # exactamente 20 → 1
            (40, 100, 2),  # exactamente 40 → 2
            (60, 100, 3),  # exactamente 60 → 3
            (80, 100, 4),  # exactamente 80 → 4
            (100, 100, 5),  # 100 %
            # Inmediatamente superiores a cada límite.
            (21, 100, 2),
            (41, 100, 3),
            (61, 100, 4),
            (81, 100, 5),
            # Fracciones exactas con denominador 5 (límites sin flotante).
            (1, 5, 1),  # 20 %
            (2, 5, 2),  # 40 %
            (3, 5, 3),  # 60 %
            (4, 5, 4),  # 80 %
            (5, 5, 5),  # 100 %
            # Valores intermedios.
            (1, 3, 2),   # 33.33 %
            (2, 3, 4),   # 66.67 %
            (1, 2, 3),   # 50 %
        ],
    )
    def test_limites(self, numerador, denominador, esperado):
        assert porcentaje_a_nivel(numerador, denominador) == esperado

    def test_denominador_cero_invalido(self):
        with pytest.raises(ValueError):
            porcentaje_a_nivel(0, 0)

    def test_numerador_negativo_invalido(self):
        with pytest.raises(ValueError):
            porcentaje_a_nivel(-1, 5)

    def test_numerador_mayor_que_denominador_invalido(self):
        with pytest.raises(ValueError):
            porcentaje_a_nivel(6, 5)


class TestPorcentajeDecimal:
    def test_exacto_y_truncado_a_2_decimales(self):
        assert porcentaje_decimal(1, 2) == Decimal("50.00")
        assert porcentaje_decimal(2, 3) == Decimal("66.67")
        assert porcentaje_decimal(0, 3) == Decimal("0.00")

    def test_invalidos(self):
        with pytest.raises(ValueError):
            porcentaje_decimal(1, 0)
        with pytest.raises(ValueError):
            porcentaje_decimal(-1, 3)
