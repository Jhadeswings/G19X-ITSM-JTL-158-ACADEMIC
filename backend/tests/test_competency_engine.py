"""Tests del CompetencyEngine (Fase 5) contra PostgreSQL real.

Cubre §13–§19: cinco competencias exactas, límites 20/40/60/80, mínimos
de evidencia, EN_PROCESO excluido, condición mínima de aprendizaje según
PRD, Componente B por año calendario America/Mexico_City, DI propagado,
fortalezas/oportunidades deterministas, experiencia contextual y la
comprobación explícita de que ResultadoActual NO se persiste.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import text

from app.core.db import Base
from app.core.fechas import fecha_negocio_hoy
from app.models.capacitacion import Capacitacion
from app.models.empleado import Empleado
from app.models.participacion import Participacion
from app.models.proyecto import Proyecto
from app.schemas.resultado_actual import ClaveCompetencia, EstadoCompetencia
from app.services.competency_engine import CompetencyEngine
from tests.helpers import crear_empleado

import app.models as paquete_modelos

ANIO_ACTUAL = fecha_negocio_hoy().year

DI = EstadoCompetencia.INSUFFICIENT_DATA
CALC = EstadoCompetencia.CALCULABLE

# Tablas de dominio existentes (Fases 1–4B). ResultadoActual NO está.
TABLAS_DOMINIO = {
    "cuentas_acceso",
    "empleados",
    "proyectos",
    "participaciones",
    "capacitaciones",
    "evaluaciones",
    "tokens_recuperacion",
    "auditorias_modificacion",
}


# ----------------------------------------------------------------------
# Helpers locales de siembra (solo para esta suite).
# ----------------------------------------------------------------------
def crear_proyecto(db, nombre, estado="COMPLETADO"):
    proyecto = Proyecto(
        nombre=nombre,
        nombre_normalizado=nombre.lower().replace(" ", "-"),
        estado=estado,
    )
    db.add(proyecto)
    db.commit()
    db.refresh(proyecto)
    return proyecto


def crear_participaciones(
    db,
    empleado_id,
    *,
    total,
    estados_proyectos=None,
    coordino=0,
    en_equipo=0,
    explico=0,
    roles_distintos=1,
    resolvio_problema=False,
    prefijo="P",
):
    """Crea ``total`` proyectos+participaciones con controles exactos.

    ``roles_distintos`` <= ``total`` reparte roles distintos; el resto
    repite el último. Los indicadores booleanos son True en las primeras
    ``n`` participaciones.
    """
    estados = estados_proyectos or ["COMPLETADO"] * total
    roles_base = ["QA", "Desarrollador", "Líder Técnico", "PO", "Analista", "Diseñador"]
    objetos = []
    for i in range(total):
        proyecto = Proyecto(
            nombre=f"{prefijo}-{i}",
            nombre_normalizado=f"{prefijo.lower()}-{i}",
            estado=estados[i],
        )
        db.add(proyecto)
        db.flush()
        rol = roles_base[i] if i < roles_distintos else roles_base[roles_distintos - 1]
        objetos.append(
            Participacion(
                empleado_id=empleado_id,
                proyecto_id=proyecto.id,
                rol=rol,
                en_equipo=i < en_equipo,
                coordino_tareas=i < coordino,
                explico_a_publico_distinto=i < explico,
                resolvio_problema=resolvio_problema,
                horas=10,
                fecha_registro=fecha_negocio_hoy(),
            )
        )
    db.add_all(objetos)
    db.commit()
    return objetos


def crear_capacitaciones(db, empleado_id, *, completadas_anio_actual=0, registradas_extra=0, completadas_anios_pasados=0):
    """Siembra capacitaciones controlando cada conteo por separado.

    - ``completadas_anio_actual``: completado=True con fecha del año local actual.
    - ``registradas_extra``: completado=False con fecha del año actual
      (cuentan como registros para la condición mínima del PRD, NO para B).
    - ``completadas_anios_pasados``: completado=True con fecha del año anterior
      (cuentan como registros, NO para B).
    """
    objetos = []
    for i in range(completadas_anio_actual):
        objetos.append(Capacitacion(empleado_id=empleado_id, nombre=f"Curso actual {i}", fecha=date(ANIO_ACTUAL, 6, 1), completado=True))
    for i in range(registradas_extra):
        objetos.append(Capacitacion(empleado_id=empleado_id, nombre=f"Curso extra {i}", fecha=date(ANIO_ACTUAL, 6, 1), completado=False))
    for i in range(completadas_anios_pasados):
        objetos.append(Capacitacion(empleado_id=empleado_id, nombre=f"Curso viejo {i}", fecha=date(ANIO_ACTUAL - 1, 6, 1), completado=True))
    if objetos:
        db.add_all(objetos)
        db.commit()
    return objetos


def calcular(db, empleado_id):
    return CompetencyEngine(db).calculate(empleado_id)


def competencia(dto, clave):
    return next(c for c in dto.competencias if c.clave == clave)


# ----------------------------------------------------------------------
# Empleado inexistente
# ----------------------------------------------------------------------
def test_empleado_inexistente_lanza_lookup_error(db):
    with pytest.raises(LookupError):
        calcular(db, 999999)


# ----------------------------------------------------------------------
# §16.1 Desempeño técnico
# ----------------------------------------------------------------------
def test_desempeno_exactamente_3_evaluables(db):
    empleado = crear_empleado(db)
    crear_participaciones(db, empleado.id, total=3, prefijo="DT3")  # 3 COMPLETADO
    c = competencia(calcular(db, empleado.id), ClaveCompetencia.DESEMPENO_TECNICO)
    assert c.estado == CALC
    assert c.nivel == 5  # 3/3 = 100 %
    assert c.valor == Decimal("100.00")
    assert c.evidencia["proyectos_evaluables"] == 3


def test_desempeno_excluye_en_proceso(db):
    empleado = crear_empleado(db)
    crear_participaciones(
        db,
        empleado.id,
        total=7,
        estados_proyectos=["COMPLETADO", "COMPLETADO", "CANCELADO"]
        + ["EN_PROCESO"] * 4,
        prefijo="DTEP",
    )
    c = competencia(calcular(db, empleado.id), ClaveCompetencia.DESEMPENO_TECNICO)
    # Solo 3 evaluables: 2/3 = 66.67 % → nivel 4. EN_PROCESO no entra jamás.
    assert c.estado == CALC
    assert c.nivel == 4
    assert c.valor == Decimal("66.67")
    assert c.evidencia["proyectos_en_proceso_excluidos"] == 4
    assert c.evidencia["proyectos_evaluables"] == 3


def test_desempeno_menos_de_3_evaluables_es_di(db):
    empleado = crear_empleado(db)
    crear_participaciones(db, empleado.id, total=2, prefijo="DT2")
    c = competencia(calcular(db, empleado.id), ClaveCompetencia.DESEMPENO_TECNICO)
    assert c.estado == DI
    assert c.nivel is None  # DI no es nivel 0 ni un entero
    assert c.valor is None


def test_desempeno_solo_en_proceso_es_di(db):
    empleado = crear_empleado(db)
    crear_participaciones(
        db, empleado.id, total=5, estados_proyectos=["EN_PROCESO"] * 5, prefijo="DTEP2"
    )
    c = competencia(calcular(db, empleado.id), ClaveCompetencia.DESEMPENO_TECNICO)
    assert c.estado == DI


def test_desempeno_cero_porcentaje(db):
    empleado = crear_empleado(db)
    crear_participaciones(
        db, empleado.id, total=3, estados_proyectos=["CANCELADO"] * 3, prefijo="DT0"
    )
    c = competencia(calcular(db, empleado.id), ClaveCompetencia.DESEMPENO_TECNICO)
    assert c.estado == CALC
    assert c.nivel == 1
    assert c.valor == Decimal("0.00")


# ----------------------------------------------------------------------
# §16.2–§16.4 Liderazgo / Trabajo en equipo / Comunicación (mínimos 2 y 3)
# ----------------------------------------------------------------------
@pytest.mark.parametrize(
    ("clave", "indicador"),
    [
        (ClaveCompetencia.LIDERAZGO, "coordino"),
        (ClaveCompetencia.TRABAJO_EQUIPO, "en_equipo"),
        (ClaveCompetencia.COMUNICACION, "explico"),
    ],
)
def test_indicador_con_2_participaciones_es_di(db, clave, indicador):
    empleado = crear_empleado(db)
    crear_participaciones(db, empleado.id, total=2, **{indicador: 2}, prefijo="MIN2")
    c = competencia(calcular(db, empleado.id), clave)
    assert c.estado == DI
    assert c.nivel is None
    assert c.evidencia["participaciones"] == 2


@pytest.mark.parametrize(
    ("clave", "indicador", "verdaderos", "esperado_nivel", "esperado_valor"),
    [
        # Con 3 participaciones ya es CALCULABLE, incluso en 0 % y 100 %.
        (ClaveCompetencia.LIDERAZGO, "coordino", 0, 1, Decimal("0.00")),
        (ClaveCompetencia.LIDERAZGO, "coordino", 3, 5, Decimal("100.00")),
        (ClaveCompetencia.TRABAJO_EQUIPO, "en_equipo", 0, 1, Decimal("0.00")),
        (ClaveCompetencia.TRABAJO_EQUIPO, "en_equipo", 3, 5, Decimal("100.00")),
        (ClaveCompetencia.COMUNICACION, "explico", 0, 1, Decimal("0.00")),
        (ClaveCompetencia.COMUNICACION, "explico", 3, 5, Decimal("100.00")),
    ],
)
def test_indicador_con_3_participaciones(
    db, clave, indicador, verdaderos, esperado_nivel, esperado_valor
):
    empleado = crear_empleado(db)
    crear_participaciones(
        db, empleado.id, total=3, **{indicador: verdaderos}, prefijo="MIN3"
    )
    c = competencia(calcular(db, empleado.id), clave)
    assert c.estado == CALC
    assert c.nivel == esperado_nivel
    assert c.valor == esperado_valor


# ----------------------------------------------------------------------
# §15 Límites exactos 20/40/60/80 e inmediatamente superiores (denominador 100)
# ----------------------------------------------------------------------
@pytest.mark.parametrize(
    ("coordino", "esperado_nivel"),
    [
        (0, 1),  #   0 % → 1
        (20, 1),  # exactamente 20 % → 1 (límite inclusive)
        (21, 2),  # inmediatamente superior a 20
        (40, 2),  # exactamente 40 % → 2
        (41, 3),  # inmediatamente superior a 40
        (60, 3),  # exactamente 60 % → 3
        (61, 4),  # inmediatamente superior a 60
        (80, 4),  # exactamente 80 % → 4
        (81, 5),  # inmediatamente superior a 80
        (100, 5),  # 100 % → 5
    ],
)
def test_liderazgo_limites_denominador_100(db, coordino, esperado_nivel):
    empleado = crear_empleado(db)
    crear_participaciones(db, empleado.id, total=100, coordino=coordino, prefijo="L100")
    c = competencia(calcular(db, empleado.id), ClaveCompetencia.LIDERAZGO)
    assert c.estado == CALC
    assert c.nivel == esperado_nivel
    assert c.evidencia["coordino_tareas_true"] == coordino


@pytest.mark.parametrize(
    ("clave", "indicador", "verdaderos"),
    [
        # Denominador 5: los cuatro límites caen exactos (20/40/60/80/100).
        (ClaveCompetencia.TRABAJO_EQUIPO, "en_equipo", 1),
        (ClaveCompetencia.TRABAJO_EQUIPO, "en_equipo", 2),
        (ClaveCompetencia.TRABAJO_EQUIPO, "en_equipo", 3),
        (ClaveCompetencia.TRABAJO_EQUIPO, "en_equipo", 4),
        (ClaveCompetencia.TRABAJO_EQUIPO, "en_equipo", 5),
        (ClaveCompetencia.COMUNICACION, "explico", 1),
        (ClaveCompetencia.COMUNICACION, "explico", 2),
        (ClaveCompetencia.COMUNICACION, "explico", 3),
        (ClaveCompetencia.COMUNICACION, "explico", 4),
        (ClaveCompetencia.COMUNICACION, "explico", 5),
    ],
)
def test_limites_exactos_denominador_5(db, clave, indicador, verdaderos):
    empleado = crear_empleado(db)
    crear_participaciones(
        db, empleado.id, total=5, **{indicador: verdaderos}, prefijo="L5"
    )
    c = competencia(calcular(db, empleado.id), clave)
    assert c.estado == CALC
    assert c.nivel == verdaderos  # k/5 = 20k % → nivel k (1..5)


# ----------------------------------------------------------------------
# §16.5 Capacidad de aprendizaje: condición mínima según PRD
# ----------------------------------------------------------------------
def test_aprendizaje_2_registradas_0_completadas_condicion_pasa_y_b_es_1(db):
    """Caso 1: 2 capacitaciones registradas pero ninguna completada.

    La condición mínima del PRD se supera (2 registros), pero el
    Componente B cuenta 0 cursos completados del año → B = 1.
    """
    empleado = crear_empleado(db)
    crear_capacitaciones(db, empleado.id, registradas_extra=2)
    c = competencia(calcular(db, empleado.id), ClaveCompetencia.APRENDIZAJE)
    assert c.estado == CALC
    assert c.evidencia["capacitaciones_registradas"] == 2
    assert c.evidencia["cursos_completados_anio"] == 0
    assert c.evidencia["componente_b_cursos"] == 1
    assert c.evidencia["componente_a_roles"] == 1  # 0 roles
    assert c.valor == Decimal("1.00")  # 1*0.60 + 1*0.40
    assert c.nivel == 1


def test_aprendizaje_1_registrada_3_proyectos_unicos(db):
    """Caso 2: 1 capacitación + 3 proyectos únicos.

    La condición mínima se supera por proyectos y B se calcula con
    normalidad (0 completadas del año → B = 1).
    """
    empleado = crear_empleado(db)
    crear_participaciones(db, empleado.id, total=3, roles_distintos=1, prefijo="AP3")
    crear_capacitaciones(db, empleado.id, registradas_extra=1)
    c = competencia(calcular(db, empleado.id), ClaveCompetencia.APRENDIZAJE)
    assert c.estado == CALC
    assert c.evidencia["proyectos_unicos"] == 3
    assert c.evidencia["capacitaciones_registradas"] == 1
    assert c.evidencia["cursos_completados_anio"] == 0
    assert c.evidencia["componente_b_cursos"] == 1
    assert c.evidencia["componente_a_roles"] == 2  # 1 rol
    assert c.valor == Decimal("1.60")  # 2*0.60 + 1*0.40
    assert c.nivel == 2


def test_aprendizaje_condicion_minima_no_cumplida_es_di(db):
    """1 capacitación y solo 2 proyectos únicos: PRD exige 2 cursos O 3 proyectos."""
    empleado = crear_empleado(db)
    crear_participaciones(db, empleado.id, total=2, prefijo="APDI")
    crear_capacitaciones(db, empleado.id, registradas_extra=1)
    c = competencia(calcular(db, empleado.id), ClaveCompetencia.APRENDIZAJE)
    assert c.estado == DI
    assert c.nivel is None
    assert c.valor is None
    assert c.evidencia["capacitaciones_registradas"] == 1
    assert c.evidencia["proyectos_unicos"] == 2


def test_aprendizaje_exactly_2_cursos_y_exactly_3_proyectos_por_separado(db):
    """Los dos umbrales exactos de la condición mínima, por separado."""
    # Exactamente 2 registros y 0 proyectos → CALCULABLE.
    e1 = crear_empleado(db, nombre="Umbral Cursos")
    crear_capacitaciones(db, e1.id, registradas_extra=2)
    assert competencia(calcular(db, e1.id), ClaveCompetencia.APRENDIZAJE).estado == CALC
    # Exactamente 3 proyectos y 1 registro → CALCULABLE (cubierto arriba).
    # 2 registros + 2 proyectos → CALCULABLE por los cursos.
    e2 = crear_empleado(db, nombre="Umbral Mixto")
    crear_participaciones(db, e2.id, total=2, prefijo="APM")
    crear_capacitaciones(db, e2.id, registradas_extra=2)
    assert competencia(calcular(db, e2.id), ClaveCompetencia.APRENDIZAJE).estado == CALC


# ----------------------------------------------------------------------
# §16.5 Componente B: cursos del año calendario local (America/Mexico_City)
# ----------------------------------------------------------------------
def test_cursos_de_anios_anteriores_no_cuentan_para_b(db):
    """Caso 3: 3 completadas del año pasado + 4 del año actual.

    ``cursos_completados_anio`` debe ser 4 (no 7): B usa SOLO el año
    calendario local actual.
    """
    empleado = crear_empleado(db)
    crear_capacitaciones(
        db,
        empleado.id,
        completadas_anio_actual=4,
        completadas_anios_pasados=3,
    )
    c = competencia(calcular(db, empleado.id), ClaveCompetencia.APRENDIZAJE)
    assert c.estado == CALC
    assert c.evidencia["capacitaciones_registradas"] == 7
    assert c.evidencia["cursos_completados_anio"] == 4
    assert c.evidencia["componente_b_cursos"] == 3  # 4–5 cursos → B=3
    assert c.evidencia["anio_calendario"] == ANIO_ACTUAL


def test_solo_cursos_de_anio_anterior_b_es_1(db):
    """2 completadas del año pasado: condición del PRD pasa (2 registros),
    pero B cuenta 0 del año actual → B = 1."""
    empleado = crear_empleado(db)
    crear_capacitaciones(db, empleado.id, completadas_anios_pasados=2)
    c = competencia(calcular(db, empleado.id), ClaveCompetencia.APRENDIZAJE)
    assert c.estado == CALC
    assert c.evidencia["cursos_completados_anio"] == 0
    assert c.evidencia["componente_b_cursos"] == 1


@pytest.mark.parametrize(
    ("cursos", "esperado_b"),
    [
        (0, 1),  # 0–1 → 1
        (1, 1),
        (2, 2),  # 2–3 → 2
        (3, 2),
        (4, 3),  # 4–5 → 3
        (5, 3),
        (6, 4),  # 6–7 → 4
        (7, 4),
        (8, 5),  # 8+ → 5
    ],
)
def test_escala_componente_b(db, cursos, esperado_b):
    """Límites de cursos 0/1/2/3/4/5/6/7/8 (caso 4: >=2 del año actual)."""
    empleado = crear_empleado(db)
    # 3 proyectos únicos, 1 rol → A = 2 fijo, para aislar B.
    crear_participaciones(db, empleado.id, total=3, roles_distintos=1, prefijo="ESCB")
    if cursos:
        crear_capacitaciones(db, empleado.id, completadas_anio_actual=cursos)
    c = competencia(calcular(db, empleado.id), ClaveCompetencia.APRENDIZAJE)
    assert c.estado == CALC
    assert c.evidencia["cursos_completados_anio"] == cursos
    assert c.evidencia["componente_b_cursos"] == esperado_b
    # score = A*0.60 + B*0.40 con A=2: verificar consistencia completa.
    esperado_score = Decimal("2") * Decimal("0.60") + Decimal(esperado_b) * Decimal("0.40")
    assert c.valor == esperado_score.quantize(Decimal("0.01"))


@pytest.mark.parametrize(
    ("roles", "esperado_a"),
    [
        (1, 2),  # 1 rol → 2
        (2, 3),  # 2 roles → 3
        (3, 4),  # 3 roles → 4
        (4, 5),  # 4 roles → 5 (tope 4+)
        (5, 5),  # 5 roles sigue en 5
    ],
)
def test_escala_componente_a(db, roles, esperado_a):
    """Límites de roles 0/1/2/3/4+ (el caso 0 roles está cubierto antes)."""
    empleado = crear_empleado(db)
    # 2 registros NO completados → B = 1 fijo, para aislar A.
    crear_capacitaciones(db, empleado.id, registradas_extra=2)
    crear_participaciones(db, empleado.id, total=roles, roles_distintos=roles, prefijo="ESCA")
    c = competencia(calcular(db, empleado.id), ClaveCompetencia.APRENDIZAJE)
    assert c.estado == CALC
    assert c.evidencia["roles_distintos"] == roles
    assert c.evidencia["componente_a_roles"] == esperado_a


@pytest.mark.parametrize(
    ("roles", "cursos", "esperado_a", "esperado_b", "esperado_score", "esperado_nivel"),
    [
        # Combinaciones A/B con score y nivel verificados a mano.
        (2, 2, 3, 2, Decimal("2.60"), 3),
        (3, 4, 4, 3, Decimal("3.60"), 4),
        (1, 8, 2, 5, Decimal("3.20"), 3),
        (0, 6, 1, 4, Decimal("2.20"), 2),  # condición por cursos
        (5, 0, 5, 1, Decimal("3.40"), 3),  # condición por proyectos (5)
        (4, 3, 5, 2, Decimal("3.80"), 4),
        (2, 7, 3, 4, Decimal("3.40"), 3),
        (3, 5, 4, 3, Decimal("3.60"), 4),
    ],
)
def test_combinaciones_a_b(
    db, roles, cursos, esperado_a, esperado_b, esperado_score, esperado_nivel
):
    empleado = crear_empleado(db)
    if roles:
        crear_participaciones(
            db, empleado.id, total=roles, roles_distintos=roles, prefijo="COMB"
        )
    if cursos:
        crear_capacitaciones(db, empleado.id, completadas_anio_actual=cursos)
    else:
        # Sin cursos del año: asegurar la condición mínima del PRD con
        # 2 registros no completados (no afectan B).
        crear_capacitaciones(db, empleado.id, registradas_extra=2)
    c = competencia(calcular(db, empleado.id), ClaveCompetencia.APRENDIZAJE)
    assert c.estado == CALC
    assert c.evidencia["componente_a_roles"] == esperado_a
    assert c.evidencia["componente_b_cursos"] == esperado_b
    assert c.evidencia["score"] == esperado_score
    assert c.valor == esperado_score
    assert c.nivel == esperado_nivel


# ----------------------------------------------------------------------
# DI propagado correctamente
# ----------------------------------------------------------------------
def test_todas_las_competencias_di_sin_datos(db):
    empleado = crear_empleado(db)
    dto = calcular(db, empleado.id)
    assert len(dto.competencias) == 5
    assert {c.clave for c in dto.competencias} == {
        ClaveCompetencia.DESEMPENO_TECNICO,
        ClaveCompetencia.LIDERAZGO,
        ClaveCompetencia.TRABAJO_EQUIPO,
        ClaveCompetencia.COMUNICACION,
        ClaveCompetencia.APRENDIZAJE,
    }
    for c in dto.competencias:
        assert c.estado == DI
        assert c.nivel is None
        assert c.valor is None
        assert c.model_dump()["etiqueta"] is None  # DI tampoco tiene etiqueta
    assert dto.fortalezas == []
    assert dto.oportunidades == []


def test_di_parcial_no_contamina_calculables(db):
    """DI parcial: técnico en DI (solo 1 evaluable) mientras el resto calcula.

    Nota: liderazgo/equipo/comunicación comparten el conteo de
    participaciones (3), y aprendizaje es calculable por proyectos (PRD):
    A=2 (1 rol), B=1 → 1.60 → nivel 2.
    """
    empleado = crear_empleado(db)
    crear_participaciones(
        db,
        empleado.id,
        total=3,
        estados_proyectos=["COMPLETADO", "EN_PROCESO", "EN_PROCESO"],
        coordino=3,
        prefijo="DPARC",
    )
    dto = calcular(db, empleado.id)

    # Técnico: 1 evaluable < 3 → DI, excluido de fortalezas y oportunidades.
    assert competencia(dto, ClaveCompetencia.DESEMPENO_TECNICO).estado == DI

    lid = competencia(dto, ClaveCompetencia.LIDERAZGO)
    assert lid.estado == CALC and lid.nivel == 5
    assert lid.model_dump()["etiqueta"] == "Alto"

    assert competencia(dto, ClaveCompetencia.TRABAJO_EQUIPO).nivel == 1
    assert competencia(dto, ClaveCompetencia.COMUNICACION).nivel == 1
    apr = competencia(dto, ClaveCompetencia.APRENDIZAJE)
    assert apr.estado == CALC and apr.nivel == 2

    assert dto.fortalezas == [ClaveCompetencia.LIDERAZGO]
    assert dto.oportunidades == [
        ClaveCompetencia.TRABAJO_EQUIPO,
        ClaveCompetencia.COMUNICACION,
        ClaveCompetencia.APRENDIZAJE,
    ]


# ----------------------------------------------------------------------
# §19 Fortalezas y oportunidades
# ----------------------------------------------------------------------
def _sembrar_dataset_fortalezas(db):
    """Dataset mixto: técnico 5, liderazgo 4, equipo 1, comunicación 2,
    aprendizaje 4 → 3 fortalezas y 2 oportunidades."""
    empleado = crear_empleado(db, nombre="Empleado Mixto")
    crear_participaciones(
        db,
        empleado.id,
        total=6,
        estados_proyectos=["COMPLETADO"] * 5 + ["CANCELADO"],
        coordino=4,  # 66.67 % → 4
        en_equipo=1,  # 16.67 % → 1
        explico=2,  # 33.33 % → 2
        roles_distintos=6,  # A = 5
        prefijo="FZA",
    )
    crear_capacitaciones(db, empleado.id, completadas_anio_actual=4)  # B = 3
    return empleado


def test_fortalezas_y_oportunidades_deterministas(db):
    empleado = _sembrar_dataset_fortalezas(db)
    dto = calcular(db, empleado.id)

    niveles = {c.clave: c.nivel for c in dto.competencias}
    assert niveles == {
        ClaveCompetencia.DESEMPENO_TECNICO: 5,  # 5/6 = 83.33 %
        ClaveCompetencia.LIDERAZGO: 4,
        ClaveCompetencia.TRABAJO_EQUIPO: 1,
        ClaveCompetencia.COMUNICACION: 2,
        ClaveCompetencia.APRENDIZAJE: 4,  # 5*0.6 + 3*0.4 = 4.20
    }
    assert dto.fortalezas == [
        ClaveCompetencia.DESEMPENO_TECNICO,
        ClaveCompetencia.LIDERAZGO,
        ClaveCompetencia.APRENDIZAJE,
    ]
    assert dto.oportunidades == [
        ClaveCompetencia.TRABAJO_EQUIPO,
        ClaveCompetencia.COMUNICACION,
    ]


def test_nivel_3_no_es_fortaleza_ni_oportunidad(db):
    empleado = crear_empleado(db, nombre="Empleado Neutro")
    crear_participaciones(
        db,
        empleado.id,
        total=5,
        coordino=3,  # 60 % → 3
        en_equipo=3,  # 60 % → 3
        explico=3,  # 60 % → 3
        roles_distintos=5,  # A = 5
        prefijo="NEU",
    )
    crear_capacitaciones(db, empleado.id, completadas_anio_actual=2)  # B = 2 → 3.80 → 4
    dto = calcular(db, empleado.id)
    assert dto.fortalezas == [
        ClaveCompetencia.DESEMPENO_TECNICO,  # 100 %
        ClaveCompetencia.APRENDIZAJE,
    ]
    assert dto.oportunidades == []
    for clave in (
        ClaveCompetencia.LIDERAZGO,
        ClaveCompetencia.TRABAJO_EQUIPO,
        ClaveCompetencia.COMUNICACION,
    ):
        assert clave not in dto.fortalezas
        assert clave not in dto.oportunidades


def test_resolvio_problema_no_afecta_nada(db):
    """§10: resolvio_problema es contextual; no cambia resultados ni evidencia."""
    empleado_a = _sembrar_dataset_fortalezas(db)
    dto_a = calcular(db, empleado_a.id)

    empleado_b = crear_empleado(db, nombre="Empleado Mixto 2")
    crear_participaciones(
        db,
        empleado_b.id,
        total=6,
        estados_proyectos=["COMPLETADO"] * 5 + ["CANCELADO"],
        coordino=4,
        en_equipo=1,
        explico=2,
        roles_distintos=6,
        resolvio_problema=True,  # ÚNICA diferencia
        prefijo="FZB",
    )
    crear_capacitaciones(db, empleado_b.id, completadas_anio_actual=4)
    dto_b = calcular(db, empleado_b.id)

    dump_a = dto_a.model_dump()
    dump_a["empleado_id"] = empleado_b.id  # ignorar el id propio
    dump_b = dto_b.model_dump()
    assert dump_a == dump_b
    # "resolvio" no aparece en ninguna evidencia.
    assert "resolvio" not in str(dump_b)


# ----------------------------------------------------------------------
# §17 Experiencia como contexto
# ----------------------------------------------------------------------
def test_experiencia_con_fecha_ingreso_y_proyectos(db):
    empleado = crear_empleado(db, nombre="Veterano")
    empleado.fecha_ingreso = fecha_negocio_hoy() - timedelta(days=730)  # ~2 años
    db.commit()
    crear_participaciones(db, empleado.id, total=3, prefijo="EXP")
    dto = calcular(db, empleado.id)
    assert dto.experiencia.fecha_ingreso == empleado.fecha_ingreso
    assert dto.experiencia.anios_antiguedad == Decimal("2.00")
    assert dto.experiencia.proyectos_unicos == 3


def test_experiencia_sin_fecha_ingreso(db):
    empleado = crear_empleado(db, nombre="Sin Ingreso")
    crear_participaciones(db, empleado.id, total=2, prefijo="EXPN")
    dto = calcular(db, empleado.id)
    assert dto.experiencia.fecha_ingreso is None
    assert dto.experiencia.anios_antiguedad is None
    assert dto.experiencia.proyectos_unicos == 2


def test_experiencia_no_es_competencia_ni_fortaleza(db):
    """40 años de antigüedad: la experiencia sigue siendo contexto y
    JAMÁS produce competencias, fortalezas ni oportunidades."""
    empleado = crear_empleado(db, nombre="Muy Veterano")
    empleado.fecha_ingreso = fecha_negocio_hoy() - timedelta(days=40 * 365)
    db.commit()
    # Solo 2 participaciones y sin capacitaciones: por evidencia, TODO
    # queda en DI (o bajo) aunque la antigüedad sea enorme.
    crear_participaciones(db, empleado.id, total=2, coordino=2, en_equipo=2, explico=2, prefijo="MV")
    dto = calcular(db, empleado.id)
    claves = {c.clave for c in dto.competencias}
    assert len(claves) == 5  # solo las cinco competencias exactas
    assert dto.experiencia.anios_antiguedad > Decimal("39")
    assert dto.experiencia.proyectos_unicos == 2
    for clave in claves:
        assert competencia(dto, clave).estado == DI
    assert dto.fortalezas == []
    assert dto.oportunidades == []


# ----------------------------------------------------------------------
# §18 Comprobación explícita de que ResultadoActual NO se persiste
# ----------------------------------------------------------------------
def _contar_filas(db):
    return {
        tabla: int(
            db.execute(text(f"SELECT COUNT(*) FROM {tabla}")).scalar() or 0
        )
        for tabla in sorted(TABLAS_DOMINIO)
    }


def test_resultado_actual_no_se_persiste(db):
    empleado = _sembrar_dataset_fortalezas(db)
    antes = _contar_filas(db)
    assert antes["empleados"] == 1
    assert antes["participaciones"] == 6

    dto = CompetencyEngine(db).calculate(empleado.id)
    assert dto.empleado_id == empleado.id

    db.expire_all()
    assert _contar_filas(db) == antes  # el motor es de solo lectura

    # 1) No existe ninguna tabla nueva en PostgreSQL (solo dominio + alembic).
    tablas_bd = set(
        db.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public'"
            )
        ).scalars()
    )
    assert tablas_bd == TABLAS_DOMINIO | {"alembic_version"}
    assert not any("resultado" in t for t in tablas_bd)

    # 2) Los metadatos de SQLAlchemy tampoco registran tabla alguna extra.
    assert set(Base.metadata.tables) == TABLAS_DOMINIO

    # 3) No existe modelo persistente ResultadoActual.
    assert not hasattr(paquete_modelos, "ResultadoActual")
