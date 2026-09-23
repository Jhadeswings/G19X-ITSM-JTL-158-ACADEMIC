"""Servicio puro del 9-Box (Fase 6).

Especificación Técnica v1.5 §20, PRD v1.3 §10 y Style Guide v1.1 §16:
- ``performance_axis`` proviene EXCLUSIVAMENTE del nivel de Desempeño
  técnico (§20.1). La experiencia no participa (PRD §7).
- ``potential_axis`` = (Liderazgo + Trabajo en equipo + Comunicación +
  Capacidad de aprendizaje) / 4 (§20.2). NO se redondea antes de
  clasificar: la clasificación usa el valor Decimal exacto.
- Rangos de ejes (§20.3): [1,3) → Bajo; [3,4) → Medio; [4,5] → Alto.
- Si CUALQUIERA de las cinco competencias está en INSUFFICIENT_DATA,
  ambos ejes y la celda son ``null`` (§20.2). DI no es nivel 0 (§14).
- ``box_code`` (Style Guide §16): primer carácter = eje de Desempeño
  (A=Alto, M=Medio, B=Bajo); segundo carácter = eje de Potencial
  (A=Alto, M=Medio, B=Bajo). Ejemplos: AM, MA, BB.
- La celda se deriva SOLO de los ejes: sin IA, sin score global, sin
  ranking (PRD §5, §10.3).
- Servicio PURO: no accede a la base de datos ni al tiempo del sistema;
  reutilizable desde la generación de evaluaciones y desde lecturas.
"""

from decimal import Decimal
from typing import Sequence

from app.schemas.evaluacion import NineBoxDTO
from app.schemas.resultado_actual import (
    ClaveCompetencia,
    CompetenciaResultadoDTO,
    EstadoCompetencia,
)

# §20.3: límites exactos de banda por eje (comparación Decimal, sin float).
_LIMITE_MEDIO = Decimal("3")
_LIMITE_ALTO = Decimal("4")

# §20.2: las cuatro competencias del eje de potencial. Desempeño técnico
# NUNCA entra al potencial y la experiencia no es competencia (PRD §7).
_CLAVES_POTENCIAL = (
    ClaveCompetencia.LIDERAZGO,
    ClaveCompetencia.TRABAJO_EQUIPO,
    ClaveCompetencia.COMUNICACION,
    ClaveCompetencia.APRENDIZAJE,
)

_ETIQUETAS = {"B": "bajo", "M": "medio", "A": "alto"}


def clasificar_eje(valor: Decimal) -> str:
    """Letra de banda del eje según §20.3 (Style Guide §16): B/M/A."""
    if valor < _LIMITE_MEDIO:
        return "B"
    if valor < _LIMITE_ALTO:
        return "M"
    return "A"


def etiqueta_eje(valor: Decimal | None) -> str | None:
    """Etiqueta textual de presentación del eje (None si no calculable)."""
    return None if valor is None else _ETIQUETAS[clasificar_eje(valor)]


def calcular_nine_box(competencias: Sequence[CompetenciaResultadoDTO]) -> NineBoxDTO:
    """Calcula los ejes y la celda 9-Box a partir de las cinco competencias.

    - Recibe exactamente las cinco competencias del ``ResultadoActual``
      (cualquier otra cantidad lanza ``ValueError``: contrato estricto).
    - Si alguna está en ``INSUFFICIENT_DATA`` devuelve todo ``None``.
    """
    por_clave = {c.clave: c for c in competencias}
    if len(por_clave) != len(competencias):
        raise ValueError("Competencias duplicadas en la entrada del 9-Box.")
    faltantes = set(ClaveCompetencia) - set(por_clave)
    if faltantes:
        raise ValueError(
            f"Faltan competencias para el 9-Box: {sorted(c.value for c in faltantes)}."
        )

    # §20.2: DI en CUALQUIERA de las cinco => ejes y celda null.
    if any(c.estado == EstadoCompetencia.INSUFFICIENT_DATA for c in por_clave.values()):
        return NineBoxDTO()

    desempeno = por_clave[ClaveCompetencia.DESEMPENO_TECNICO]
    # §20.1: performance = nivel de Desempeño técnico, exacto.
    performance_axis = Decimal(desempeno.nivel)
    # §20.2: promedio Decimal exacto de las cuatro competencias de potencial.
    potential_axis = sum(
        (Decimal(por_clave[clave].nivel) for clave in _CLAVES_POTENCIAL),
        Decimal(0),
    ) / Decimal(4)

    # La celda se deriva ÚNICAMENTE de los ejes (Style Guide §16).
    box_code = f"{clasificar_eje(performance_axis)}{clasificar_eje(potential_axis)}"
    return NineBoxDTO(
        performance_axis=performance_axis,
        potential_axis=potential_axis,
        box_code=box_code,
        etiqueta_performance=etiqueta_eje(performance_axis),
        etiqueta_potencial=etiqueta_eje(potential_axis),
    )