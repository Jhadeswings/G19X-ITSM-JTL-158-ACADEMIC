"""Tests de inmutabilidad, IDOR y snapshot de evaluaciones (Fase 6).

Especificación §24 (inmutabilidad en dos capas: API + trigger PostgreSQL),
§32/§21 (ownership estricto: el Empleado solo ve su historial y sin
9-Box) y PRD §16.3 (la corrección de datos fuente posteriores NO
modifica una evaluación histórica ya generada).
"""

from datetime import date

import pytest
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.db import Base
from app.core.fechas import fecha_negocio_hoy
from app.models.capacitacion import Capacitacion
from app.services import evaluation_service
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


@pytest.fixture()
def token_rh(client, cuenta_rh):
    return login_y_token(client, "rh@empresa.dev")


@pytest.fixture()
def token_empleado(client, cuenta_empleado):
    return login_y_token(client, "empleado@empresa.dev")


@pytest.fixture()
def evaluacion_generada(db, cuenta_rh, cuenta_empleado):
    """Genera el periodo vigente (un empleado activo) usando el servicio."""
    evaluation_service.generar_evaluaciones(db, cuenta_rh=cuenta_rh)
    fila = db.execute(text("SELECT id FROM evaluaciones ORDER BY id")).one()
    return fila[0]


class TestInmutabilidadApi:
    """§24: no existen PATCH ni DELETE; las lecturas son read-only."""

    def test_patch_no_permitido_rh(self, client, token_rh, evaluacion_generada):
        respuesta = client.patch(
            f"{URL_RH_EVALUACIONES}/{evaluacion_generada}",
            json={"liderazgo_nivel": 1},
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 405

    def test_delete_no_permitido_rh(self, client, token_rh, evaluacion_generada):
        respuesta = client.delete(
            f"{URL_RH_EVALUACIONES}/{evaluacion_generada}",
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 405

    def test_patch_no_permitido_me(self, client, token_empleado):
        assert client.patch(
            URL_ME_EVALUACIONES, json={}, headers=cabecera(token_empleado)
        ).status_code == 405

    def test_no_existe_endpoint_por_id_para_empleado(
        self, client, token_empleado, evaluacion_generada
    ):
        # El contrato /me solo define el historial propio: ni siquiera
        # existe GET /me/evaluations/{id} (superficie mínima anti-IDOR).
        respuesta = client.get(
            f"{URL_ME_EVALUACIONES}/{evaluacion_generada}",
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code in (404, 405)


class TestInmutabilidadSQL:
    """§24: el trigger PostgreSQL rechaza UPDATE y DELETE directamente."""

    def test_update_sql_directo_rechazado(self, db, evaluacion_generada):
        with pytest.raises(SQLAlchemyError):
            db.execute(text("UPDATE evaluaciones SET liderazgo_nivel = 1"))
        db.rollback()  # la transacción queda abortada tras el trigger

    def test_delete_sql_directo_rechazado(self, db, evaluacion_generada):
        with pytest.raises(SQLAlchemyError):
            db.execute(text("DELETE FROM evaluaciones"))
        db.rollback()


class TestIDOR:
    @pytest.fixture()
    def escenario_ab(self, db, client):
        empleado_a = crear_empleado(db, nombre="Empleado A")
        empleado_b = crear_empleado(db, nombre="Empleado B")
        crear_cuenta(db, rol="EMPLEADO", email="a@empresa.dev", empleado=empleado_a)
        crear_cuenta(db, rol="EMPLEADO", email="b@empresa.dev", empleado=empleado_b)
        return empleado_a, empleado_b

    @pytest.fixture()
    def generadas(self, client, token_rh, escenario_ab):
        respuesta = client.post(
            URL_RH_GENERAR_EVALUACIONES, headers=cabecera(token_rh)
        )
        assert respuesta.status_code == 201
        return respuesta.json()["items"]

    def test_empleado_a_no_ve_evaluaciones_de_b(
        self, client, escenario_ab, generadas
    ):
        empleado_a, _ = escenario_ab
        token_a = login_y_token(client, "a@empresa.dev")
        lista = client.get(
            URL_ME_EVALUACIONES, headers=cabecera(token_a)
        ).json()
        assert lista["total"] == 1
        assert lista["items"][0]["empleado_id"] == empleado_a.id

    def test_empleado_no_puede_usar_rutas_rh(
        self, client, escenario_ab, generadas
    ):
        empleado_a, _ = escenario_ab
        token_a = login_y_token(client, "a@empresa.dev")
        assert client.get(
            URL_RH_EVALUACIONES, headers=cabecera(token_a)
        ).status_code == 403
        url = URL_RH_EMPLEADO_EVALUACIONES.format(
            empleado_id=empleado_a.id + 1  # evaluar "a otro" vía ruta RH
        )
        assert client.get(url, headers=cabecera(token_a)).status_code == 403


class TestSnapshotNoRecalcula:
    def test_cambios_fuente_no_modifican_historico(
        self, db, client, token_rh, cuenta_rh, cuenta_empleado
    ):
        from app.services.competency_engine import CompetencyEngine

        empleado_id = cuenta_empleado.empleado_id
        evaluation_service.generar_evaluaciones(db, cuenta_rh=cuenta_rh)

        # Estado inicial snapshot: empleado sin capacitaciones ⇒ DI.
        fila = db.execute(
            text(
                "SELECT aprendizaje_status, aprendizaje_nivel, box_code "
                "FROM evaluaciones WHERE empleado_id = :e"
            ),
            {"e": empleado_id},
        ).one()
        assert fila.aprendizaje_status == "INSUFFICIENT_DATA"
        assert fila.aprendizaje_nivel is None
        assert fila.box_code is None
        antes = db.execute(
            text("SELECT * FROM evaluaciones WHERE empleado_id = :e"),
            {"e": empleado_id},
        ).one()

        # Cambian los datos fuente (§16.3): nuevas capacitaciones.
        for i in range(4):
            db.add(
                Capacitacion(
                    empleado_id=empleado_id,
                    nombre=f"Curso nuevo {i}",
                    fecha=date(ANIO, 6, 1),
                    completado=True,
                )
            )
        db.commit()

        # El ResultadoActual SÍ cambia al recalcular...
        competencia = next(
            c
            for c in CompetencyEngine(db).calculate(empleado_id).competencias
            if c.clave.value == "aprendizaje"
        )
        assert competencia.estado.value == "CALCULABLE"
        assert competencia.nivel is not None

        # ...pero la Evaluacion histórica NO cambia (ni en la fila ni en la API).
        despues = db.execute(
            text("SELECT * FROM evaluaciones WHERE empleado_id = :e"),
            {"e": empleado_id},
        ).one()
        assert tuple(antes) == tuple(despues)

        lista_rh = client.get(
            URL_RH_EVALUACIONES, headers=cabecera(token_rh)
        ).json()["items"]
        item = next(i for i in lista_rh if i["empleado_id"] == empleado_id)
        aprendizaje = next(
            c for c in item["competencias"] if c["clave"] == "aprendizaje"
        )
        assert aprendizaje["status"] == "INSUFFICIENT_DATA"
        assert aprendizaje["nivel"] is None
        assert item["nine_box"]["box_code"] is None


class TestNoPersistenciaResultadoActual:
    def test_no_existe_tabla_resultado_actual(self, db):
        tablas = {
            fila[0]
            for fila in db.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = 'public'"
                )
            )
        }
        assert not any("resultado" in nombre for nombre in tablas)
        assert "resultado_actuals" not in tablas
        assert "resultado_actual" not in tablas

    def test_no_existe_modelo_persistente(self):
        import app.models as paquete_modelos

        assert not hasattr(paquete_modelos, "ResultadoActual")
        assert "resultado_actual" not in Base.metadata.tables
        assert "evaluaciones" in Base.metadata.tables

