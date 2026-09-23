"""Tests de generación y lectura de evaluaciones oficiales (Fase 6).

Cubre (Especificación §23, PRD §16): RH permitido, Empleado 403, sin
token 401, solo empleados activos, snapshot correcto, generado_por,
conflicto 409 al repetir periodo, atomicidad total ante fallo a mitad,
concurrencia real con dos sesiones (advisory lock), lecturas RH
paginadas con 9-Box y lecturas /me sin 9-Box.
"""

import threading

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select
from datetime import date

from app.core.db import SessionLocal
from app.core.fechas import fecha_negocio_hoy, periodo_actual
from app.models.capacitacion import Capacitacion
from app.models.evaluacion import Evaluacion
from app.models.participacion import Participacion
from app.models.proyecto import Proyecto
from app.schemas.resultado_actual import EstadoCompetencia
from app.services import evaluation_service
from app.services.competency_engine import CompetencyEngine
from tests.helpers import (
    URL_ME_EVALUACIONES,
    URL_RH_EMPLEADO_EVALUACIONES,
    URL_RH_EVALUACIONES,
    URL_RH_GENERAR_EVALUACIONES,
    cabecera,
    crear_cuenta,
    crear_empleado,
    login_y_token,
)

ANIO = fecha_negocio_hoy().year
DI = EstadoCompetencia.INSUFFICIENT_DATA.value


# ----------------------------------------------------------------------
# Siembra: datos que hacen competencias CALCULABLES (niveles deterministas)
# ----------------------------------------------------------------------
def sembrar_empleado_evaluable(db, *, prefijo, completo=True):
    """Empleado con desempeño técnico calculable (3 proyectos COMPLETADO)
    y, si ``completo``, 4 capacitaciones completadas del año actual."""
    empleado = crear_empleado(db, nombre=f"Empleado {prefijo}")
    for i in range(3):
        proyecto = Proyecto(
            nombre=f"{prefijo}-P{i}",
            nombre_normalizado=f"{prefijo.lower()}-p{i}",
            estado="COMPLETADO",
        )
        db.add(proyecto)
        db.flush()
        db.add(
            Participacion(
                empleado_id=empleado.id,
                proyecto_id=proyecto.id,
                rol="QA",
                horas=10,
                fecha_registro=fecha_negocio_hoy(),
            )
        )
    if completo:
        for i in range(4):
            db.add(
                Capacitacion(
                    empleado_id=empleado.id,
                    nombre=f"{prefijo}-C{i}",
                    fecha=date(ANIO, 6, 1),
                    completado=True,
                )
            )
    db.commit()
    return empleado


def contar_evaluaciones(db):
    return int(db.scalar(select(func.count()).select_from(Evaluacion)) or 0)


@pytest.fixture()
def token_rh(client, cuenta_rh):
    return login_y_token(client, "rh@empresa.dev")


@pytest.fixture()
def token_empleado(client, cuenta_empleado):
    return login_y_token(client, "empleado@empresa.dev")


@pytest.fixture()
def escenario(db):
    """Dos empleados activos evaluables + uno inactivo + cuentas Empleado."""
    empleado_a = sembrar_empleado_evaluable(db, prefijo="A", completo=True)
    empleado_b = sembrar_empleado_evaluable(db, prefijo="B", completo=False)
    inactivo = crear_empleado(db, nombre="Inactivo")
    inactivo.activo = False
    db.commit()
    crear_cuenta(db, rol="EMPLEADO", email="a@empresa.dev", empleado=empleado_a)
    crear_cuenta(db, rol="EMPLEADO", email="b@empresa.dev", empleado=empleado_b)
    return {"a": empleado_a, "b": empleado_b, "inactivo": inactivo}


class TestGeneracion:
    def test_rh_genera_periodo_vigente(self, client, token_rh, cuenta_rh, escenario):
        respuesta = client.post(URL_RH_GENERAR_EVALUACIONES, headers=cabecera(token_rh))
        assert respuesta.status_code == 201, respuesta.text
        datos = respuesta.json()
        assert datos["periodo"] == periodo_actual()
        assert datos["total_generadas"] == 2  # solo activos
        ids = {item["empleado_id"] for item in datos["items"]}
        assert ids == {escenario["a"].id, escenario["b"].id}
        assert escenario["inactivo"].id not in ids
        # generado_por correcto: la cuenta RH autenticada
        for item in datos["items"]:
            assert item["generado_por_cuenta_id"] == cuenta_rh.id
            assert "nine_box" in item  # contrato RH (PRD §10)

    def test_empleado_403(self, client, token_empleado):
        assert client.post(
            URL_RH_GENERAR_EVALUACIONES, headers=cabecera(token_empleado)
        ).status_code == 403

    def test_sin_token_401(self, client):
        assert client.post(URL_RH_GENERAR_EVALUACIONES).status_code == 401

    def test_solo_empleados_activos(self, client, token_rh, escenario):
        respuesta = client.post(URL_RH_GENERAR_EVALUACIONES, headers=cabecera(token_rh))
        ids = {i["empleado_id"] for i in respuesta.json()["items"]}
        assert escenario["inactivo"].id not in ids
        assert ids == {escenario["a"].id, escenario["b"].id}

    def test_sin_empleados_activos_respuesta_coherente(self, client, token_rh):
        respuesta = client.post(URL_RH_GENERAR_EVALUACIONES, headers=cabecera(token_rh))
        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["periodo"] == periodo_actual()
        assert datos["total_generadas"] == 0
        assert datos["items"] == []

    def test_repetir_mismo_periodo_409(self, client, token_rh, db, escenario):
        primera = client.post(URL_RH_GENERAR_EVALUACIONES, headers=cabecera(token_rh))
        assert primera.status_code == 201
        segunda = client.post(URL_RH_GENERAR_EVALUACIONES, headers=cabecera(token_rh))
        assert segunda.status_code == 409
        assert contar_evaluaciones(db) == 2  # sin duplicados


class TestSnapshot:
    def test_snapshot_igual_al_resultado_actual(self, client, token_rh, db, escenario):
        from app.services.nine_box import calcular_nine_box

        resultado_motor = CompetencyEngine(db).calculate(escenario["a"].id)
        por_clave = {c.clave.value: c for c in resultado_motor.competencias}

        respuesta = client.post(URL_RH_GENERAR_EVALUACIONES, headers=cabecera(token_rh))
        assert respuesta.status_code == 201
        item = next(
            i for i in respuesta.json()["items"] if i["empleado_id"] == escenario["a"].id
        )
        historicas = {c["clave"]: c for c in item["competencias"]}
        assert set(historicas) == set(por_clave)  # exactamente cinco
        for clave, actual in por_clave.items():
            assert historicas[clave]["status"] == actual.estado.value
            assert historicas[clave]["nivel"] == actual.nivel

        nueve = calcular_nine_box(resultado_motor.competencias)
        assert item["nine_box"]["box_code"] == nueve.box_code
        # Comparación numérica: Numeric(4,3) rellena a '5.000' al leerse.
        from decimal import Decimal as _Decimal

        assert _Decimal(item["nine_box"]["performance_axis"]) == nueve.performance_axis

    def test_di_propaga_ejes_null(self, client, token_rh, db, escenario):
        # Un empleado activo SIN datos tiene las cinco competencias en DI:
        # niveles null (jamás 0) y ejes/celda null (§20.2, §14).
        sin_datos = crear_empleado(db, nombre="Sin datos")
        respuesta = client.post(URL_RH_GENERAR_EVALUACIONES, headers=cabecera(token_rh))
        assert respuesta.status_code == 201
        item = next(
            i for i in respuesta.json()["items"] if i["empleado_id"] == sin_datos.id
        )
        aprendizaje = next(
            c for c in item["competencias"] if c["clave"] == "aprendizaje"
        )
        assert aprendizaje["status"] == DI
        assert aprendizaje["nivel"] is None
        assert item["nine_box"]["performance_axis"] is None
        assert item["nine_box"]["potential_axis"] is None
        assert item["nine_box"]["box_code"] is None


class TestAtomicidad:
    def test_fallo_a_mitad_cero_evaluaciones(self, db, cuenta_rh, monkeypatch):
        sembrar_empleado_evaluable(db, prefijo="X")
        sembrar_empleado_evaluable(db, prefijo="Y")

        real = CompetencyEngine.calculate
        estado = {"llamadas": 0}

        def calcular_fallido(self, empleado_id):
            estado["llamadas"] += 1
            if estado["llamadas"] == 2:
                raise RuntimeError("Fallo simulado a mitad de la generación")
            return real(self, empleado_id)

        monkeypatch.setattr(CompetencyEngine, "calculate", calcular_fallido)
        with pytest.raises(RuntimeError):
            evaluation_service.generar_evaluaciones(db, cuenta_rh=cuenta_rh)

        assert estado["llamadas"] == 2
        assert contar_evaluaciones(db) == 0  # rollback TOTAL, cero parciales


class TestConcurrencia:
    def test_dos_sesiones_una_generacion_efectiva(self, db, cuenta_rh, escenario):
        """Dos sesiones INDEPENDIENTES ejecutan la generación a la vez.

        El advisory lock por periodo serializa: una genera, la otra recibe
        409. Nunca hay duplicados (UNIQUE(empleado_id, periodo))."""
        exitosos, conflictos = [], []

        def trabajo():
            sesion = SessionLocal()
            try:
                resultado = evaluation_service.generar_evaluaciones(
                    sesion, cuenta_rh=cuenta_rh
                )
                exitosos.append(resultado.total_generadas)
            except HTTPException as error:
                conflictos.append(error.status_code)
            finally:
                sesion.close()

        hilos = [threading.Thread(target=trabajo) for _ in range(2)]
        for hilo in hilos:
            hilo.start()
        for hilo in hilos:
            hilo.join(timeout=30)

        assert sorted(exitosos) == [2]  # exactamente UNA generación efectiva
        assert conflictos == [409]  # la segunda obtiene conflicto
        assert contar_evaluaciones(db) == 2  # sin duplicados


class TestLecturaRH:
    @pytest.fixture()
    def generadas(self, client, token_rh, escenario):
        respuesta = client.post(URL_RH_GENERAR_EVALUACIONES, headers=cabecera(token_rh))
        assert respuesta.status_code == 201
        return respuesta.json()

    def test_listar_paginado_con_nine_box(self, client, token_rh, generadas):
        respuesta = client.get(
            f"{URL_RH_EVALUACIONES}?pagina=1&por_pagina=1", headers=cabecera(token_rh)
        )
        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["total"] == 2
        assert datos["por_pagina"] == 1
        assert len(datos["items"]) == 1
        assert "nine_box" in datos["items"][0]

    def test_filtro_empleado(self, client, token_rh, generadas, escenario):
        respuesta = client.get(
            f"{URL_RH_EVALUACIONES}?empleado_id={escenario['a'].id}",
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["total"] == 1
        assert datos["items"][0]["empleado_id"] == escenario["a"].id

    def test_consultar_por_id(self, client, token_rh, generadas):
        evaluacion_id = generadas["items"][0]["id"]
        respuesta = client.get(
            f"{URL_RH_EVALUACIONES}/{evaluacion_id}", headers=cabecera(token_rh)
        )
        assert respuesta.status_code == 200
        assert respuesta.json()["id"] == evaluacion_id

    def test_consultar_inexistente_404(self, client, token_rh):
        assert client.get(
            f"{URL_RH_EVALUACIONES}/999", headers=cabecera(token_rh)
        ).status_code == 404

    def test_historial_de_un_empleado(self, client, token_rh, generadas, escenario):
        url = URL_RH_EMPLEADO_EVALUACIONES.format(empleado_id=escenario["a"].id)
        respuesta = client.get(url, headers=cabecera(token_rh))
        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["total"] == 1
        assert datos["items"][0]["empleado_id"] == escenario["a"].id

    def test_historial_empleado_inexistente_404(self, client, token_rh):
        url = URL_RH_EMPLEADO_EVALUACIONES.format(empleado_id=999)
        assert client.get(url, headers=cabecera(token_rh)).status_code == 404

    def test_empleado_no_puede_leer_rutas_rh(self, client, token_empleado):
        assert client.get(
            URL_RH_EVALUACIONES, headers=cabecera(token_empleado)
        ).status_code == 403


class TestLecturaEmpleado:
    @pytest.fixture()
    def tokens_ab(self, client, escenario):
        return (
            login_y_token(client, "a@empresa.dev"),
            login_y_token(client, "b@empresa.dev"),
        )

    @pytest.fixture()
    def generadas(self, client, token_rh, escenario):
        respuesta = client.post(URL_RH_GENERAR_EVALUACIONES, headers=cabecera(token_rh))
        assert respuesta.status_code == 201
        return respuesta.json()

    def test_solo_historial_propio(self, client, tokens_ab, generadas, escenario):
        token_a, token_b = tokens_ab
        lista_a = client.get(URL_ME_EVALUACIONES, headers=cabecera(token_a)).json()
        lista_b = client.get(URL_ME_EVALUACIONES, headers=cabecera(token_b)).json()
        assert lista_a["total"] == 1
        assert lista_a["items"][0]["empleado_id"] == escenario["a"].id
        assert lista_b["total"] == 1
        assert lista_b["items"][0]["empleado_id"] == escenario["b"].id

    def test_sin_ejes_ni_nine_box(self, client, tokens_ab, generadas):
        """PRD §21: el Empleado NO ve ejes ni 9-Box (exclusivo de RH, §10)."""
        token_a, _ = tokens_ab
        item = client.get(
            URL_ME_EVALUACIONES, headers=cabecera(token_a)
        ).json()["items"][0]
        assert "nine_box" not in item
        assert "performance_axis" not in item
        assert "potential_axis" not in item
        assert "box_code" not in item
        assert len(item["competencias"]) == 5  # sí conserva el snapshot

    def test_rh_no_puede_usar_rutas_me(self, client, token_rh):
        assert client.get(
            URL_ME_EVALUACIONES, headers=cabecera(token_rh)
        ).status_code == 403

    def test_sin_token_401(self, client):
        assert client.get(URL_ME_EVALUACIONES).status_code == 401



