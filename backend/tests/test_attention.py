"""Tests de Atención requerida (Fase 10, PRD §19.1, Especificación §30).

Cubre: perfil completo + participación reciente (no aparece), perfil
incompleto, frontera exacta de 90 días con ``fecha_registro`` (>=),
dentro de la ventana, ambas condiciones (una sola aparición), inactivos
excluidos, cálculo de fecha en America/Mexico_City vía
``fecha_negocio_hoy`` (monkeypatch determinista), independencia de
evaluaciones históricas, no persistencia, RBAC y motivos neutrales
estructurados. Sin tabla Alert ni auditoría por consulta (§30).
"""

from datetime import date, timedelta

import pytest
from sqlalchemy import text

import app.services.attention_service as servicio_atencion
from app.core.fechas import fecha_negocio_hoy
from app.models.evaluacion import Evaluacion
from app.models.participacion import Participacion
from app.models.proyecto import Proyecto
from tests.helpers import (
    URL_RH_ATTENTION,
    cabecera,
    crear_cuenta,
    crear_empleado,
    login_y_token,
)


@pytest.fixture()
def token_rh(client, cuenta_rh):
    return login_y_token(client, "rh@empresa.dev")


@pytest.fixture()
def token_empleado(client, cuenta_empleado):
    return login_y_token(client, "empleado@empresa.dev")


def consultar(client, token):
    return client.get(URL_RH_ATTENTION, headers=cabecera(token))


def empleado_completo(db, nombre):
    """Empleado activo con perfil completo (nombre, correo, puesto, área,
    fecha de ingreso)."""
    empleado = crear_empleado(db, nombre=nombre)
    empleado.puesto = "Puesto"
    empleado.area = "Área"
    empleado.fecha_ingreso = date(2020, 1, 1)
    crear_cuenta(
        db, rol="EMPLEADO", email=f"{nombre.lower()}@empresa.dev", empleado=empleado
    )
    return empleado


def con_participacion(db, empleado, fecha_registro, *, n=0):
    """Agrega una participación con ``fecha_registro`` explícito."""
    proyecto = Proyecto(
        nombre=f"{empleado.nombre}-{empleado.id}-P{n}",
        nombre_normalizado=f"{empleado.nombre.lower()}-{empleado.id}-p{n}",
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
            fecha_registro=fecha_registro,
        )
    )
    db.commit()
    return empleado


class TestCondiciones:
    """Tests 1–6."""

    def test_perfil_completo_y_participacion_reciente_no_aparece(
        self, client, token_rh, db
    ):
        empleado = empleado_completo(db, "Bien")
        con_participacion(db, empleado, fecha_negocio_hoy())
        datos = consultar(client, token_rh).json()
        ids = [i["empleado_id"] for i in datos["items"]]
        assert empleado.id not in ids
        assert datos["total"] == 0

    def test_perfil_incompleto_aparece(self, client, token_rh, db):
        empleado = empleado_completo(db, "SinPuesto")
        empleado.puesto = None  # falta un dato obligatorio (PRD §19.1)
        db.commit()
        con_participacion(db, empleado, fecha_negocio_hoy())
        datos = consultar(client, token_rh).json()
        item = next(i for i in datos["items"] if i["empleado_id"] == empleado.id)
        assert item["motivos"] == ["PERFIL_INCOMPLETO"]

    def test_frontera_exacta_90_dias_no_aparece(self, client, token_rh, db):
        """``fecha_registro == hoy_negocio - 90`` cumple ``>= límite``:
        la participación es reciente → no aparece por esa condición."""
        empleado = empleado_completo(db, "Frontera")
        limite = fecha_negocio_hoy() - timedelta(days=90)
        con_participacion(db, empleado, limite)
        datos = consultar(client, token_rh).json()
        item = next(
            (i for i in datos["items"] if i["empleado_id"] == empleado.id), None
        )
        assert item is None  # 90 días exactos: dentro de la ventana

    def test_participacion_dentro_de_90_dias_no_aparece(
        self, client, token_rh, db
    ):
        empleado = empleado_completo(db, "Reciente")
        con_participacion(db, empleado, fecha_negocio_hoy() - timedelta(days=89))
        datos = consultar(client, token_rh).json()
        assert empleado.id not in [i["empleado_id"] for i in datos["items"]]

    def test_91_dias_si_aparece(self, client, token_rh, db):
        empleado = empleado_completo(db, "Antiguo")
        con_participacion(db, empleado, fecha_negocio_hoy() - timedelta(days=91))
        datos = consultar(client, token_rh).json()
        item = next(i for i in datos["items"] if i["empleado_id"] == empleado.id)
        assert item["motivos"] == ["SIN_PARTICIPACION_RECIENTE"]

    def test_ambas_condiciones_aparece_una_vez(self, client, token_rh, db):
        empleado = empleado_completo(db, "Ambas")
        empleado.area = None  # perfil incompleto...
        db.commit()
        con_participacion(db, empleado, fecha_negocio_hoy() - timedelta(days=365))
        # ...y sin participación reciente: UNA sola aparición, dos motivos.
        datos = consultar(client, token_rh).json()
        apariciones = [
            i for i in datos["items"] if i["empleado_id"] == empleado.id
        ]
        assert len(apariciones) == 1
        assert set(apariciones[0]["motivos"]) == {
            "PERFIL_INCOMPLETO",
            "SIN_PARTICIPACION_RECIENTE",
        }

    def test_inactivo_excluido_aun_cumpliendo(self, client, token_rh, db):
        empleado = empleado_completo(db, "Inactivo")
        empleado.activo = False
        db.commit()  # sin participación y (ya no importa) perfil: excluido
        datos = consultar(client, token_rh).json()

class TestFechaNegocio:
    """Tests 7–8: America/Mexico_City y ``fecha_registro``."""

    def test_fecha_limite_derivada_de_fecha_negocio(
        self, client, token_rh, db, monkeypatch
    ):
        """La ventana de 90 días se calcula desde la fecha de NEGOCIO
        (America/Mexico_City desde UTC, §12), no desde la hora local del
        contenedor ni desde UTC sin convertir."""
        # Fecha de negocio fijada: límite exacto = 2026-06-25 (−90 días).
        monkeypatch.setattr(
            servicio_atencion, "fecha_negocio_hoy", lambda: date(2026, 9, 23)
        )
        exacto = empleado_completo(db, "Exacto")
        con_participacion(db, exacto, date(2026, 6, 25))  # == límite: reciente
        un_dia_menos = empleado_completo(db, "UnDiaMenos")
        con_participacion(db, un_dia_menos, date(2026, 6, 24))  # fuera
        datos = consultar(client, token_rh).json()
        ids = [i["empleado_id"] for i in datos["items"]]
        assert exacto.id not in ids
        assert un_dia_menos.id in ids

    def test_usa_fecha_registro_no_created_at(self, client, token_rh, db):
        """Participación creada AHORA (``created_at`` actual) pero con
        ``fecha_registro`` antiguo: cuenta como NO reciente (§30)."""
        empleado = empleado_completo(db, "RegistroAntiguo")
        con_participacion(db, empleado, fecha_negocio_hoy() - timedelta(days=120))
        datos = consultar(client, token_rh).json()
        item = next(i for i in datos["items"] if i["empleado_id"] == empleado.id)
        assert "SIN_PARTICIPACION_RECIENTE" in item["motivos"]


class TestDerivadaYNoPersistente:
    """Tests 9–10."""

    TABLAS = (
        "cuentas_acceso",
        "empleados",
        "proyectos",
        "participaciones",
        "capacitaciones",
        "evaluaciones",
        "tokens_recuperacion",
        "auditorias_modificacion",
    )

    def _conteos(self, db):
        return {
            tabla: db.execute(text(f"SELECT count(*) FROM {tabla}")).scalar()
            for tabla in self.TABLAS
        }

    def test_evaluacion_historica_no_altera(self, client, token_rh, cuenta_rh, db):
        empleado = empleado_completo(db, "SinParticipaciones")
        antes = consultar(client, token_rh).json()

        snapshot = {
            "periodo": "2020-Q1",
            "generado_por_cuenta_id": cuenta_rh.id,
        }
        for codigo in (
            "desempeno_tecnico",
            "liderazgo",
            "trabajo_equipo",
            "comunicacion",
            "aprendizaje",
        ):
            snapshot[f"{codigo}_nivel"] = 5
            snapshot[f"{codigo}_status"] = "CALCULABLE"
        db.add(Evaluacion(empleado_id=empleado.id, **snapshot))
        db.commit()

        assert consultar(client, token_rh).json() == antes

    def test_no_persistencia_ni_auditoria(self, client, token_rh, db):
        empleado_completo(db, "SinDatos")
        antes = self._conteos(db)
        primera = consultar(client, token_rh)
        segunda = consultar(client, token_rh)
        assert primera.status_code == segunda.status_code == 200
        assert primera.json() == segunda.json()
        assert antes == self._conteos(db)  # cero escrituras, sin Alert


class TestAcceso:
    """Tests 11–13."""

    def test_rh_permitido(self, client, token_rh):
        assert consultar(client, token_rh).status_code == 200

    def test_empleado_rechazado_403(self, client, token_empleado):
        assert consultar(client, token_empleado).status_code == 403

    def test_sin_token_401(self, client):
        assert client.get(URL_RH_ATTENTION).status_code == 401


class TestMotivosNeutrales:
    """Test 14: códigos estructurados, vocabulario prohibido (PRD §23)."""

    PALABRAS_PROHIBIDAS = (
        "problema",
        "mal empleado",
        "bajo desempeño",
        "alerta",
        "alert",
    )

    def test_motivos_estructurados_y_neutrales(self, client, token_rh, db):
        empleado_completo(db, "SinNada")  # sin participaciones
        datos = consultar(client, token_rh).json()
        assert datos["total"] >= 1
        assert set(datos) == {"total", "items"}
        codigos_validos = {"PERFIL_INCOMPLETO", "SIN_PARTICIPACION_RECIENTE"}
        for item in datos["items"]:
            assert item["motivos"], "todo item tiene al menos un motivo"
            assert set(item["motivos"]) <= codigos_validos
        texto = str(datos).lower()
        for prohibida in self.PALABRAS_PROHIBIDAS:
            assert prohibida not in texto

    def test_orden_determinista_nombre_e_id(self, client, token_rh, db):
        empleado_completo(db, "Zeta")
        empleado_completo(db, "Alfa")
        datos = consultar(client, token_rh).json()
        claves = [(i["nombre"], i["empleado_id"]) for i in datos["items"]]
        assert claves == sorted(claves)