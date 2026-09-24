"""DTOs de brechas por competencia (PRD §15, Especificación §30/dashboard).

Vista DERIVADA de una competencia a la vez: conteos y porcentajes de
niveles 1–2 (grupo de brecha) y 3–5 (resto), con ``Datos insuficientes``
reportado POR SEPARADO. Sin score, sin ranking, sin entidad persistente
y sin IA (PRD §15).

Los porcentajes usan como denominador EXCLUSIVAMENTE los empleados
evaluables (CALCULABLE) de esa competencia: ``INSUFFICIENT_DATA`` jamás
entra al denominador ni se convierte en nivel 0 (§14). Con cero
evaluables los porcentajes son ``0.00`` (sin división entre cero): un
valor neutro que el PRD prohíbe presentar automáticamente como alarma.
"""

from decimal import Decimal

from pydantic import BaseModel

from app.schemas.resultado_actual import ClaveCompetencia


class BrechaOut(BaseModel):
    """Distribución de niveles de UNA competencia (solo empleados activos).

    ``evaluables`` = nivel_1_2_count + nivel_3_5_count; los porcentajes
    se calculan sobre ``evaluables`` (nunca sobre el total con DI).
    """

    competency_code: ClaveCompetencia
    evaluables: int
    datos_insuficientes: int
    nivel_1_2_count: int
    nivel_1_2_percentage: Decimal
    nivel_3_5_count: int
    nivel_3_5_percentage: Decimal