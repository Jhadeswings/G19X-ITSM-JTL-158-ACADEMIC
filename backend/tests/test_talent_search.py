"""Tests de la búsqueda manual de talento (Fase 7, PRD §13, Especificación §26).

Cubre: criterios AND, DI no satisface min_level, solo activos, contrato
estricto (niveles 1–5 válidos; 0/6, códigos desconocidos, vacíos, campos
arbitrarios y duplicados rechazados), orden determinista (promedio
informativo desc + nombre asc + id asc), no persistencia, RBAC/IDOR y
respuesta vacía válida.
"""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import text

from app.core.fechas import fecha_negocio_hoy
from app.models.participacion import Participacion
from app.models.proyecto import Proyecto
from tests.helpers import (
    URL_RH_BUSQUEDA_MANUAL,
    cabecera,
    crear_empleado,
    login_y_token,
)

ANIO = fecha_negocio_hoy().year

# Niveles deterministas con 3 participaciones (porcentaje 20/40/60/80):
#   flags=True en 3 → nivel 5; en 2 → nivel 4; en 1 → nivel 2; en 0 → 1.
# Con solo 2 participaciones → INSUFFICIENT_DATA (mínimo 3).


def sembrar(
    db,
    nombre,
    *,
    verdaderos=None,
    coordino=None,
    equipo=None,
    explico=None,
    activo=True,
    area=None,
    participaciones=3,
):
    """Empleado con ``participaciones`` en proyectos COMPLETADO e
    indicadores booleanos independientes (True las primeras n veces).

    Por omisión los tres indicadores toman ``verdaderos`` (default 3).
    verdaderos=3 ⇒ nivel 5; 2 ⇒ 4; 1 ⇒ 2; 0 ⇒ 1 (porcentajes 20/40/60/80).
    participaciones<3 ⇒ INSUFFICIENT_DATA en las competencias booleanas.
    """
    base = 3 if verdaderos is None else verdaderos
    coordino = base if coordino is None else coordino
    equipo = base if equipo is None else equipo
    explico = base if explico is None else explico
    empleado = crear_empleado(db, nombre=nombre)
    empleado.activo = activo
    empleado.area = area
    for i in range(participaciones):
        proyecto = Proyecto(
            nombre=f"{nombre}-{empleado.id}-P{i}",
            nombre_normalizado=f"{nombre.lower()}-{empleado.id}-p{i}",
            estado="COMPLETADO",
        )
        db.add(proyecto)
        db.flush()
        db.add(
            Participacion(
                empleado_id=empleado.id,
                proyecto_id=proyecto.id,
                rol="QA",
                en_equipo=i < equipo,
                coordino_tareas=i < coordino,
                explico_a_publico_distinto=i < explico,
                horas=10,
                fecha_registro=date(ANIO, 1, 15),
            )
        )
    db.commit()
    return empleado


def buscar(client, token, criterios):
    return client.post(
        URL_RH_BUSQUEDA_MANUAL, json={"competencies": criterios}, headers=cabecera(token)
    )


@pytest.fixture()
def token_rh(client, cuenta_rh):
    return login_y_token(client, "rh@empresa.dev")


@pytest.fixture()
def token_empleado(client, cuenta_empleado):
    return login_y_token(client, "empleado@empresa.dev")


LIDERAZGO_4 = {"code": "liderazgo", "min_level": 4}
EQUIPO_4 = {"code": "trabajo_equipo", "min_level": 4}


class TestContrato:
    def test_criterios_vacios_rechazados(self, client, token_rh):
        assert buscar(client, token_rh, []).status_code == 422

    def test_codigo_invalido_rechazado(self, client, token_rh):
        respuesta = buscar(
            client, token_rh, [{"code": "innovacion", "min_level": 4}]
        )
        assert respuesta.status_code == 422

    def test_nivel_0_rechazado(self, client, token_rh):
        assert buscar(client, token_rh, [{"code": "liderazgo", "min_level": 0}]).status_code == 422

    def test_nivel_6_rechazado(self, client, token_rh):
        assert buscar(client, token_rh, [{"code": "liderazgo", "min_level": 6}]).status_code == 422

    @pytest.mark.parametrize("nivel", [1, 2, 3, 4, 5])
    def test_niveles_1_a_5_validos(self, client, token_rh, nivel):
        assert buscar(
            client, token_rh, [{"code": "liderazgo", "min_level": nivel}]
        ).status_code == 200

    def test_no_acepta_campos_arbitrarios_idor(self, client, token_rh):
        """IDOR (§32): el cliente no puede ampliar resultados con
        employee_id ni ningún otro campo de selección arbitrario."""
        respuesta = client.post(
            URL_RH_BUSQUEDA_MANUAL,
            json={
                "competencies": [LIDERAZGO_4],
                "employee_id": 3,
                "area": "TI",
            },
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 422

    def test_codigo_duplicado_rechazado(self, client, token_rh):
        respuesta = buscar(client, token_rh, [LIDERAZGO_4, LIDERAZGO_4])
        assert respuesta.status_code == 422

    def test_min_level_no_entero_rechazado(self, client, token_rh):
        respuesta = buscar(
            client, token_rh, [{"code": "liderazgo", "min_level": 4.5}]
        )
        assert respuesta.status_code == 422


class TestReglas:
    def test_una_competencia_con_coincidencias(self, client, token_rh, db):
        alto = sembrar(db, "Alto", verdaderos=3)  # nivel 5
        sembrar(db, "Bajo", verdaderos=1)  # nivel 2
        respuesta = buscar(client, token_rh, [LIDERAZGO_4])
        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["total"] == 1
        assert datos["items"][0]["empleado_id"] == alto.id

    def test_and_multiples_competencias(self, client, token_rh, db):
        # Cumple liderazgo 5 y equipo 5 vs. liderazgo 2 y equipo 2.
        sembrar(db, "Ambas", verdaderos=3)
        sembrar(db, "Ninguna", verdaderos=1)
        respuesta = buscar(client, token_rh, [LIDERAZGO_4, EQUIPO_4])
        datos = respuesta.json()
        assert datos["total"] == 1
        assert datos["items"][0]["nombre"] == "Ambas"

    def test_and_parcial_no_cumple(self, client, token_rh, db):
        # Liderazgo 5 pero equipo 2: cumple UNA y falla la otra ⇒ AND excluye.
        sembrar(db, "SoloLiderazgo", verdaderos=3, equipo=1)
        respuesta = buscar(client, token_rh, [LIDERAZGO_4, EQUIPO_4])
        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["total"] == 0
        assert datos["items"] == []

    def test_di_no_satisface_min_level(self, client, token_rh, db):
        # 2 participaciones ⇒ INSUFFICIENT_DATA: ni siquiera min_level 1.
        sembrar(db, "SinDatos", participaciones=2)
        sembrar(db, "ConDatos", verdaderos=3)
        respuesta = buscar(
            client, token_rh, [{"code": "liderazgo", "min_level": 1}]
        )
        datos = respuesta.json()
        assert datos["total"] == 1
        assert datos["items"][0]["nombre"] == "ConDatos"
        assert "SinDatos" not in [i["nombre"] for i in datos["items"]]

    def test_inactivo_excluido(self, client, token_rh, db):
        activo = sembrar(db, "Activo", verdaderos=3)
        sembrar(db, "Inactivo", verdaderos=3, activo=False)
        respuesta = buscar(client, token_rh, [LIDERAZGO_4])
        datos = respuesta.json()
        assert datos["total"] == 1
        assert datos["items"][0]["empleado_id"] == activo.id

    def test_sin_resultados_respuesta_vacia_valida(self, client, token_rh, db):
        sembrar(db, "Bajo", verdaderos=1)
        respuesta = buscar(client, token_rh, [LIDERAZGO_4])
        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["total"] == 0
        assert datos["items"] == []

    def test_respuesta_incluye_niveles_y_estado(self, client, token_rh, db):
        sembrar(db, "Alto", verdaderos=3, area="TI")
        respuesta = buscar(client, token_rh, [LIDERAZGO_4])
        item = respuesta.json()["items"][0]
        assert item["nombre"] == "Alto"
        assert item["area"] == "TI"
        competencia = item["competencias"][0]
        assert competencia["code"] == "liderazgo"
        assert competencia["estado"] == "CALCULABLE"
        assert competencia["nivel"] == 5


class TestOrden:
    def test_promedio_desc_informativo(self, client, token_rh, db):
        sembrar(db, "Maximo", verdaderos=3)  # liderazgo 5, equipo 5 → prom. 5
        sembrar(db, "Medio", verdaderos=2)  # 4, 4 → prom. 4
        respuesta = buscar(client, token_rh, [LIDERAZGO_4, EQUIPO_4])
        nombres = [i["nombre"] for i in respuesta.json()["items"]]
        assert nombres == ["Maximo", "Medio"]
        # El promedio aparece y es exactamente el de las seleccionadas.
        promedios = [Decimal(i["promedio_seleccionadas"]) for i in respuesta.json()["items"]]
        assert promedios == [Decimal("5.00"), Decimal("4.00")]

    def test_empate_desempata_nombre_asc(self, client, token_rh, db):
        sembrar(db, "Zeta", verdaderos=3)
        alfa = sembrar(db, "Alfa", verdaderos=3)
        sembrar(db, "Beta", verdaderos=3)
        respuesta = buscar(client, token_rh, [LIDERAZGO_4])
        nombres = [i["nombre"] for i in respuesta.json()["items"]]
        assert nombres == ["Alfa", "Beta", "Zeta"]
        assert respuesta.json()["items"][0]["empleado_id"] == alfa.id

    def test_empate_total_desempata_id_asc(self, client, token_rh, db):
        primero = sembrar(db, "Igual", verdaderos=3)
        segundo = sembrar(db, "Igual", verdaderos=3)
        assert segundo.id > primero.id
        respuesta = buscar(client, token_rh, [LIDERAZGO_4])
        ids = [i["empleado_id"] for i in respuesta.json()["items"]]
        assert ids == [primero.id, segundo.id]


class TestNoPersistencia:
    def test_promedio_no_se_persiste(self, client, token_rh, db):
        sembrar(db, "Alto", verdaderos=3)
        tablas = (
            "cuentas_acceso",
            "empleados",
            "proyectos",
            "participaciones",
            "capacitaciones",
            "evaluaciones",
            "tokens_recuperacion",
            "auditorias_modificacion",
        )
        antes = {
            tabla: db.execute(text(f"SELECT count(*) FROM {tabla}")).scalar()
            for tabla in tablas
        }
        primera = buscar(client, token_rh, [LIDERAZGO_4])
        segunda = buscar(client, token_rh, [LIDERAZGO_4])
        assert primera.status_code == segunda.status_code == 200
        # Misma respuesta (reproducible) y cero escrituras en la base.
        assert primera.json() == segunda.json()
        despues = {
            tabla: db.execute(text(f"SELECT count(*) FROM {tabla}")).scalar()
            for tabla in tablas
        }
        assert antes == despues

    def test_no_existe_tabla_de_busquedas_o_promedios(self, db):
        tablas = {
            fila[0]
            for fila in db.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = 'public'"
                )
            )
        }
        assert not any(
            "busqueda" in n or "search" in n or "promedio" in n or "talento" in n
            for n in tablas
        )


class TestAcceso:
    def test_rh_permitido(self, client, token_rh):
        assert buscar(client, token_rh, [LIDERAZGO_4]).status_code == 200

    def test_empleado_rechazado_403(self, client, token_empleado):
        assert buscar(client, token_empleado, [LIDERAZGO_4]).status_code == 403

    def test_sin_token_401(self, client):
        assert client.post(
            URL_RH_BUSQUEDA_MANUAL, json={"competencies": [LIDERAZGO_4]}
        ).status_code == 401


