"""Utilidades matemáticas deterministas del dominio (Fase 5).

Especificación Técnica v1.5 §15–§16.5:
- ``porcentaje_a_nivel``: conversión exacta porcentaje → nivel 1–5 con
  aritmética entera (los límites 20/40/60/80 no sufren errores de flotante).
- ``round_half_up``: redondeo mitad-hacia-arriba determinista. PROHIBIDO el
  redondeo bancario de Python ``round()`` (§16.5).
"""

from decimal import ROUND_HALF_UP, Decimal

# (límite superior inclusive de porcentaje, nivel) — §15.
_LIMITES_NIVEL: tuple[tuple[int, int], ...] = ((20, 1), (40, 2), (60, 3), (80, 4))


def round_half_up(valor: Decimal | float | str | int) -> int:
    """Redondeo determinista mitad-hacia-arriba (ROUND_HALF_UP).

    Se construye el ``Decimal`` desde ``str()`` para no heredar el ruido
    binario de los flotantes: ``round_half_up(2.5)`` es siempre 3.
    """
    return int(Decimal(str(valor)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def porcentaje_a_nivel(numerador: int, denominador: int) -> int:
    """Convierte un ratio entero a nivel 1–5 (§15) sin errores de flotante.

    Regla exacta:
        0 <= p <= 20  -> 1 ; 20 < p <= 40 -> 2 ; 40 < p <= 60 -> 3
        60 < p <= 80  -> 4 ; 80 < p <= 100 -> 5

    Compara ``numerador * 100`` contra ``limite * denominador`` con
    aritmética entera exacta, por lo que los límites 20/40/60/80 son
    precisos (p. ej. 1/5 es exactamente 20 %, sin epsilon).
    """
    if denominador <= 0:
        raise ValueError("El denominador debe ser mayor que cero.")
    if numerador < 0 or numerador > denominador:
        raise ValueError("El porcentaje debe estar en [0, 100].")
    for limite, nivel in _LIMITES_NIVEL:
        if numerador * 100 <= limite * denominador:
            return nivel
    return 5


def porcentaje_decimal(numerador: int, denominador: int) -> Decimal:
    """Porcentaje 0–100 como Decimal (2 decimales) para evidencia/DTO."""
    if denominador <= 0:
        raise ValueError("El denominador debe ser mayor que cero.")
    if numerador < 0 or numerador > denominador:
        raise ValueError("El porcentaje debe estar en [0, 100].")
    return (Decimal(numerador) * 100 / Decimal(denominador)).quantize(
        Decimal("0.01")
    )
