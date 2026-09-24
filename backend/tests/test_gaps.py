"""Tests de brechas por competencia (Fase 10, PRD §15, dashboard §19).

Cubre: una competencia por consulta, validación del catálogo cerrado,
solo activos, grupos 1–2 y 3–5, DI por separado (fuera de los grupos y
del denominador), porcentajes solo sobre evaluables, caso 0 evaluables,
no persistencia, derivación del estado actual (histórico no altera) y
RBAC. Sin score, sin ranking y sin juicio automático (PRD §15).

Perfiles de siembra (competencia liderazgo, 3 participaciones):
verdaderos 0→1, 1→2, 2→4, 3→5; con 5 participaciones 3/5=60%→3;
participaciones<3 → INSUFFICIENT_DATA.
"""

from datetime import date

import pytest
from sqlalchemy import text

from app.core.fechas import fecha_negocio_hoy
from app.models.capacitacion import Capacitacion
from app.models.evaluacion import Evaluacion
from app.models.participacion import Participacion
from app.models.proyecto import Proyecto
from tests.helpers import (
    URL_RH_GAPS,
    cabecera,
    crear_empleado,
    login_y_token,
)

ANIO = fecha_negocio_hoy().year


def sembrar(
    db,
    nombre,
    *,
    verdaderos=3,
    participaciones=3,
    cursos=0,
    roles=1,
    activo=True,
):
    """Empleado con nivel de liderazgo controlado por ``verdaderos``."""
    empleado = crear_empleado(db, nombre=nombre)
    empleado.activo = activo
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
                rol=f"ROL{i % roles}",
                en_equipo=i < verdaderos,
                coordino_tareas=i < verdaderos,
                explico_a_publico_distinto=i < verdaderos,
                horas=10,
                fecha_registro=date(ANIO, 1, 15),
            )
        )
    for k in range(cursos):
        db.add(
            Capacitacion(
                empleado_id=empleado.id,
                nombre=f"{nombre}-C{k}",
                fecha=date(ANIO, 6, 1),
                completado=True,
            )
        )
    db.commit()
    return empleado


@pytest.fixture()
def token_rh(client, cuenta_rh):
    return login_y_token(client, "rh@empresa.dev")


@pytest.fixture()
def token_empleado(client, cuenta_empleado):
    return login_y_token(client, "empleado@empresa.dev")


def brecha(client, token, code="liderazgo"):
    return client.get(
        URL_RH_GAPS, params={"competency_code": code}, headers=cabecera(token)
    )

class TestContrato:
    """Tests 1–3."""

    def test_competencia_valida(self, client, token_rh, db):
        sembrar(db, "NivelCuatro", verdaderos=2)
        respuesta = brecha(client, token_rh)
        assert respuesta.status_code == 200, respuesta.text
        datos = respuesta.json()
        assert set(datos) == {
            "competency_code",
            "evaluables",
            "datos_insuficientes",
            "nivel_1_2_count",
            "nivel_1_2_percentage",
            "nivel_3_5_count",
            "nivel_3_5_percentage",
        }
        assert datos["competency_code"] == "liderazgo"

    @pytest.mark.parametrize("code", ["innovacion", "", "LIDERAZGO"])
    def test_competencia_invalida_rechazada(self, client, token_rh, code):
        assert brecha(client, token_rh, code).status_code == 422

    def test_una_competencia_por_consulta(self, client, token_rh):
        """El contrato admite UN solo ``competency_code`` (PRD §15)."""
        respuesta = client.get(
            URL_RH_GAPS,
            params=[
                ("competency_code", "liderazgo"),
                ("competency_code", "comunicacion"),
            ],
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 422


class TestConteos:
    """Tests 4–12."""

    def test_activos_incluidos_e_inactivos_excluidos(
        self, client, token_rh, db
    ):
        sembrar(db, "Activo", verdaderos=1)  # nivel 2 → grupo 1–2
        sembrar(db, "Inactivo", verdaderos=0, activo=False)  # fuera
        datos = brecha(client, token_rh).json()
        assert datos["evaluables"] == 1
        assert datos["datos_insuficientes"] == 0
        assert datos["nivel_1_2_count"] == 1

    def test_niveles_1_2_contados(self, client, token_rh, db):
        sembrar(db, "NivelUno", verdaderos=0)  # 1
        sembrar(db, "NivelDos", verdaderos=1)  # 2
        sembrar(db, "NivelCuatro", verdaderos=2)  # 4
        datos = brecha(client, token_rh).json()
        assert datos["nivel_1_2_count"] == 2
        assert datos["nivel_3_5_count"] == 1

    def test_niveles_3_5_contados(self, client, token_rh, db):
        sembrar(db, "NivelTres", participaciones=5, verdaderos=3)  # 60%→3
        sembrar(db, "NivelCuatro", verdaderos=2)  # 4
        sembrar(db, "NivelCinco", verdaderos=3)  # 5
        datos = brecha(client, token_rh).json()
        assert datos["nivel_3_5_count"] == 3
        assert datos["nivel_1_2_count"] == 0

    def test_di_separado_y_fuera_de_los_grupos(self, client, token_rh, db):
        sembrar(db, "Di", participaciones=2)  # <3 participaciones → DI
        sembrar(db, "NivelDos", verdaderos=1)
        datos = brecha(client, token_rh).json()
        assert datos["datos_insuficientes"] == 1
        assert datos["evaluables"] == 1
        # DI no entra en NINGUNO de los dos grupos.
        assert datos["nivel_1_2_count"] == 1
        assert datos["nivel_3_5_count"] == 0

    def test_porcentaje_usa_solamente_evaluables(self, client, token_rh, db):
        """2 evaluables + 1 DI: porcentajes sobre 2, no sobre 3."""
        sembrar(db, "Di", participaciones=2)
        sembrar(db, "NivelDos", verdaderos=1)  # 1–2
        sembrar(db, "NivelCuatro", verdaderos=2)  # 3–5
        datos = brecha(client, token_rh).json()
        assert datos["evaluables"] == 2
        assert datos["datos_insuficientes"] == 1
        assert datos["nivel_1_2_percentage"] == "50.00"
        assert datos["nivel_3_5_percentage"] == "50.00"

    def test_caso_cero_evaluables(self, client, token_rh, db):
        sembrar(db, "DiUno", participaciones=2)
        sembrar(db, "DiDos", participaciones=0)
        datos = brecha(client, token_rh).json()
        assert datos["evaluables"] == 0
        assert datos["datos_insuficientes"] == 2
        assert datos["nivel_1_2_count"] == 0
        assert datos["nivel_3_5_count"] == 0
        # Sin división entre cero: porcentajes neutros explícitos.
        assert datos["nivel_1_2_percentage"] == "0.00"

class TestDerivadaYNoPersistente:
    """Tests 13–15."""

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

    def test_no_persistencia(self, client, token_rh, db):
        sembrar(db, "NivelDos", verdaderos=1)
        antes = self._conteos(db)
        primera = brecha(client, token_rh)
        segunda = brecha(client, token_rh)
        assert primera.status_code == segunda.status_code == 200
        assert primera.json() == segunda.json()  # reproducible
        assert antes == self._conteos(db)  # cero escrituras

    def test_cambio_de_datos_actuales_cambia_brecha(
        self, client, token_rh, db
    ):
        di = sembrar(db, "Di", participaciones=2)  # DI
        datos = brecha(client, token_rh).json()
        assert datos["datos_insuficientes"] == 1
        assert datos["evaluables"] == 0

        # Nuevo dato fuente: el DI se vuelve evaluable con nivel 2.
        proyecto = Proyecto(
            nombre=f"Nuevo-{di.id}",
            nombre_normalizado=f"nuevo-{di.id}",
            estado="COMPLETADO",
        )
        db.add(proyecto)
        db.flush()
        db.add(
            Participacion(
                empleado_id=di.id,
                proyecto_id=proyecto.id,
                rol="QA",
                en_equipo=True,
                coordino_tareas=True,
                explico_a_publico_distinto=True,
                horas=10,
                fecha_registro=date(ANIO, 1, 15),
            )
        )
        db.commit()

        datos = brecha(client, token_rh).json()
        assert datos["datos_insuficientes"] == 0
        assert datos["evaluables"] == 1
        assert datos["nivel_3_5_count"] == 1  # 3/3 → nivel 5

    def test_historico_no_altera_brecha(self, client, token_rh, cuenta_rh, db):
        empleado = sembrar(db, "NivelCuatro", verdaderos=2)
        antes = brecha(client, token_rh).json()

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
            snapshot[f"{codigo}_nivel"] = 1
            snapshot[f"{codigo}_status"] = "CALCULABLE"
        db.add(Evaluacion(empleado_id=empleado.id, **snapshot))
        db.commit()

        assert brecha(client, token_rh).json() == antes


class TestAcceso:
    """Tests 16–18."""

    def test_rh_permitido(self, client, token_rh):
        assert brecha(client, token_rh).status_code == 200

    def test_empleado_rechazado_403(self, client, token_empleado):
        assert brecha(client, token_empleado).status_code == 403

    def test_sin_token_401(self, client):
        assert client.get(URL_RH_GAPS).status_code == 401