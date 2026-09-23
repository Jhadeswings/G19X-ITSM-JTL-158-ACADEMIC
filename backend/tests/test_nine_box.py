"""Tests del servicio puro 9-Box (Fase 6, Especificación §20, Style Guide §16).

Cubre: las nueve combinaciones, límites exactos 3 y 4, potencial sin
redondeo previo, DI en cada una de las cinco competencias, box_code con
alfabeto A/M/B (nunca A1/A2/A3) y contrato estricto de entrada.
"""

from decimal import Decimal

import pytest

from app.schemas.evaluacion import NineBoxDTO
from app.schemas.resultado_actual import (
    ClaveCompetencia,
    CompetenciaResultadoDTO,
    EstadoCompetencia,
)
from app.services.nine_box import calcular_nine_box, clasificar_eje, etiqueta_eje

CALC = EstadoCompetencia.CALCULABLE
DI = EstadoCompetencia.INSUFFICIENT_DATA

CLAVES = [clave.value for clave in ClaveCompetencia]


def competencia(clave, nivel=None, estado=CALC):
    return CompetenciaResultadoDTO(
        clave=ClaveCompetencia(clave),
        estado=estado,
        nivel=nivel if estado == CALC else None,
        valor=Decimal(nivel) if estado == CALC and nivel is not None else None,
        evidencia={},
    )


def cinco(desempeno, liderazgo, equipo, comunicacion, aprendizaje, di=None):
    """Las cinco competencias; ``di`` marca UNA clave como INSUFFICIENT_DATA."""
    niveles = {
        "desempeno_tecnico": desempeno,
        "liderazgo": liderazgo,
        "trabajo_equipo": equipo,
        "comunicacion": comunicacion,
        "aprendizaje": aprendizaje,
    }
    return [
        competencia(clave, nivel, DI if clave == di else CALC)
        for clave, nivel in niveles.items()
    ]


class TestClasificarEje:
    def test_limites_exactos(self):
        # §20.3: [1,3) → B; [3,4) → M; [4,5] → A (comparación Decimal).
        assert clasificar_eje(Decimal("1")) == "B"
        assert clasificar_eje(Decimal("2.999")) == "B"
        assert clasificar_eje(Decimal("3")) == "M"
        assert clasificar_eje(Decimal("3.999")) == "M"
        assert clasificar_eje(Decimal("4")) == "A"
        assert clasificar_eje(Decimal("5")) == "A"

    def test_etiquetas(self):
        assert etiqueta_eje(Decimal("1")) == "bajo"
        assert etiqueta_eje(Decimal("3")) == "medio"
        assert etiqueta_eje(Decimal("4")) == "alto"
        assert etiqueta_eje(None) is None


class TestNueveCombinaciones:
    @pytest.mark.parametrize("desempeno,letra_desempeno", [(1, "B"), (3, "M"), (5, "A")])
    @pytest.mark.parametrize("potencial,letra_potencial", [(1, "B"), (3, "M"), (5, "A")])
    def test_celda(self, desempeno, letra_desempeno, potencial, letra_potencial):
        resultado = calcular_nine_box(
            cinco(desempeno, potencial, potencial, potencial, potencial)
        )
        assert resultado.box_code == f"{letra_desempeno}{letra_potencial}"
        assert resultado.performance_axis == Decimal(desempeno)
        assert resultado.potential_axis == Decimal(potencial)

    def test_box_code_usa_alfabeto_AMB(self):
        """Style Guide §16: A/M/B. NUNCA códigos A1/A2/A3."""
        codigos = set()
        for desempeno in (1, 3, 5):
            for potencial in (1, 3, 5):
                codigos.add(
                    calcular_nine_box(
                        cinco(desempeno, potencial, potencial, potencial, potencial)
                    ).box_code
                )
        assert codigos == {"AA", "AM", "AB", "MA", "MM", "MB", "BA", "BM", "BB"}
        for codigo in codigos:
            assert set(codigo) <= {"A", "M", "B"}


class TestPotencialSinRedondeoPrevio:
    def test_promedio_decimal_exacto(self):
        # (3+4+4+3)/4 = 3.5 → Medio (NO se redondea a 4 antes de clasificar).
        resultado = calcular_nine_box(cinco(5, 3, 4, 4, 3))
        assert resultado.potential_axis == Decimal("3.5")
        assert resultado.box_code == "AM"

    def test_fraccion_de_cuarto(self):
        # (2+3+3+3)/4 = 2.75 → Bajo exacto, sin redondeo.
        resultado = calcular_nine_box(cinco(3, 2, 3, 3, 3))
        assert resultado.potential_axis == Decimal("2.75")
        assert resultado.box_code == "MB"

    def test_limite_superior_exacto_4(self):
        # (4+4+4+4)/4 = 4 → Alto (límite inclusive).
        resultado = calcular_nine_box(cinco(4, 4, 4, 4, 4))
        assert resultado.potential_axis == Decimal("4")
        assert resultado.box_code == "AA"
        assert resultado.etiqueta_potencial == "alto"


class TestDatosInsuficientes:
    @pytest.mark.parametrize("clave", CLAVES)
    def test_di_en_cualquiera_de_las_cinco(self, clave):
        resultado = calcular_nine_box(cinco(5, 4, 4, 4, 4, di=clave))
        assert resultado == NineBoxDTO()  # ejes y celda null
        assert resultado.performance_axis is None
        assert resultado.potential_axis is None
        assert resultado.box_code is None
        assert resultado.etiqueta_performance is None
        assert resultado.etiqueta_potencial is None


class TestContratoEstricto:
    def test_duplicadas_rechazadas(self):
        base = cinco(3, 3, 3, 3, 3)
        duplicadas = base + [base[0]]
        with pytest.raises(ValueError):
            calcular_nine_box(duplicadas)

    def test_faltantes_rechazadas(self):
        base = cinco(3, 3, 3, 3, 3)
        with pytest.raises(ValueError):
            calcular_nine_box(base[:4])
