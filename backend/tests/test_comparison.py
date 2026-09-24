"""Tests de comparación de empleados (Fase 11, PRD §20.5).

Cubre: contrato estricto (mínimo 2, sin duplicados, extra rechazado),
reglas de actividad (404 inexistente / 422 inactivo sin exclusión
silenciosa), cinco competencias, DI preservado, experiencia como
contexto (nunca score), ausencia de 9-Box/ganador/ranking/score/
recomendación, no persistencia, derivación del estado actual
(histórico no altera), orden neutral que conserva employee_ids y RBAC.

Perfiles de siembra (competencia liderazgo, 3 participaciones):
verdaderos 1→2, 2→4, 3→5; participaciones<3 → INSUFFICIENT_DATA.
"""

from datetime import date, timedelta

import pytest
from sqlalchemy import text

from app.core.fechas import fecha_negocio_hoy
from app.models.evaluacion import Evaluacion
from app.models.participacion import Participacion
from app.models.proyecto import Proyecto
from tests.helpers import (
    URL_RH_COMPARACION,
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
    activo=True,
    anios_antiguedad=1,
):
    """Empleado con nivel de liderazgo y antigüedad controlados."""
    empleado = crear_empleado(db, nombre=nombre)
    empleado.activo = activo
    empleado.puesto = f"Puesto {nombre}"
    empleado.area = f"Área {nombre}"
    empleado.fecha_ingreso = fecha_negocio_hoy() - timedelta(
        days=int(anios_antiguedad * 365)
    )
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
                rol=f"ROL{i}",
                en_equipo=i < verdaderos,
                coordino_tareas=i < verdaderos,
                explico_a_publico_distinto=i < verdaderos,
                horas=10,
                fecha_registro=date(ANIO, 1, 15),
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


def comparar(client, token, ids, **extra):
    cuerpo = {"employee_ids": ids}
    cuerpo.update(extra)
    return client.post(URL_RH_COMPARACION, json=cuerpo, headers=cabecera(token))


CLAVES = {
    "desempeno_tecnico",
    "liderazgo",
    "trabajo_equipo",
    "comunicacion",
    "aprendizaje",
}


class TestContrato:
    """Tests 1–4 y 22: entrada estricta."""

    def test_exactamente_dos(self, client, token_rh, db):
        a = sembrar(db, "Alfa")
        b = sembrar(db, "Beta")
        respuesta = comparar(client, token_rh, [a.id, b.id])
        assert respuesta.status_code == 200, respuesta.text
        assert respuesta.json()["total"] == 2

    def test_tres_o_mas(self, client, token_rh, db):
        ids = [sembrar(db, n).id for n in ("Uno", "Dos", "Tres")]
        respuesta = comparar(client, token_rh, ids)
        assert respuesta.status_code == 200
        assert respuesta.json()["total"] == 3

    @pytest.mark.parametrize("ids", [[], [1]])
    def test_menos_de_dos_422(self, client, token_rh, ids):
        assert comparar(client, token_rh, ids).status_code == 422

    def test_duplicados_422(self, client, token_rh, db):
        a = sembrar(db, "Dup")
        assert comparar(client, token_rh, [a.id, a.id]).status_code == 422

    def test_id_no_positivo_422(self, client, token_rh):
        assert comparar(client, token_rh, [0, 1]).status_code == 422
        assert comparar(client, token_rh, [1, -5]).status_code == 422

    def test_campo_faltante_422(self, client, token_rh):
        r = client.post(URL_RH_COMPARACION, json={}, headers=cabecera(token_rh))
        assert r.status_code == 422

    def test_campos_arbitrarios_rechazados_422(self, client, token_rh, db):
        a = sembrar(db, "Estricto")
        b = sembrar(db, "Estricta")
        # El cliente no puede inyectar nombres, niveles ni resultados.
        assert (
            comparar(client, token_rh, [a.id, b.id], nombre="Impuesto").status_code
            == 422
        )
        assert (
            comparar(client, token_rh, [a.id, b.id], niveles={"liderazgo": 5})
            .status_code
            == 422
        )
        assert (
            comparar(client, token_rh, [a.id, b.id], resultado="ganador").status_code
            == 422
        )


class TestReglasActividad:
    """Tests 5–6: inexistente/inactivo sin exclusión silenciosa."""

    def test_id_inexistente_404(self, client, token_rh, db):
        a = sembrar(db, "Existe")
        respuesta = comparar(client, token_rh, [a.id, 99999])
        assert respuesta.status_code == 404
        assert "Empleado no encontrado" in respuesta.json()["detail"]

    def test_empleado_inactivo_422_y_no_silencioso(self, client, token_rh, db):
        activo = sembrar(db, "Activo")
        inactivo = sembrar(db, "Retirado", activo=False)
        respuesta = comparar(client, token_rh, [activo.id, inactivo.id])
        # Petición completa rechazada: nunca se devuelve solo el activo.
        assert respuesta.status_code == 422
        assert str(inactivo.id) in respuesta.json()["detail"]


class TestContenido:
    """Tests 10–13: cinco competencias, DI y experiencia."""

    def test_cinco_competencias(self, client, token_rh, db):
        a = sembrar(db, "Cinco")
        b = sembrar(db, "Seis")
        datos = comparar(client, token_rh, [a.id, b.id]).json()
        for item in datos["items"]:
            assert {c["clave"] for c in item["competencias"]} == CLAVES
            assert len(item["competencias"]) == 5

    def test_datos_insuficientes_preservado(self, client, token_rh, db):
        di = sembrar(db, "Insuficiente", participaciones=2)
        testigo = sembrar(db, "Testigo")
        datos = comparar(client, token_rh, [di.id, testigo.id]).json()
        item = next(i for i in datos["items"] if i["empleado_id"] == di.id)
        for competencia in item["competencias"]:
            assert competencia["estado"] == "INSUFFICIENT_DATA"
            assert competencia["nivel"] is None  # nunca 0

    def test_experiencia_como_contexto(self, client, token_rh, db):
        veterano = sembrar(db, "Veterana", anios_antiguedad=20)
        nueva = sembrar(db, "Novata", anios_antiguedad=0)
        datos = comparar(client, token_rh, [veterano.id, nueva.id]).json()
        exp = next(
            i for i in datos["items"] if i["empleado_id"] == veterano.id
        )["experiencia"]
        assert exp["proyectos_unicos"] == 3
        assert float(exp["anios_antiguedad"]) >= 19
        assert exp["fecha_ingreso"] is not None

    def test_experiencia_no_es_score(self, client, token_rh, db):
        a = sembrar(db, "SinScore")
        b = sembrar(db, "SinPuntaje")
        datos = comparar(client, token_rh, [a.id, b.id]).json()
        texto = str(datos).lower()
        assert "experience_score" not in texto
        assert "experiencia_score" not in texto
        for item in datos["items"]:
            assert set(item["experiencia"]) == {
                "fecha_ingreso",
                "anios_antiguedad",
                "proyectos_unicos",
            }


class TestProhibiciones:
    """Tests 14–18: nada de 9-Box, ganador, ranking, score ni IA."""

    def test_respuesta_sin_9box_ganador_ranking_score_recomendacion(
        self, client, token_rh, db
    ):
        a = sembrar(db, "Limpia", verdaderos=3)
        b = sembrar(db, "Limpio", verdaderos=1)
        respuesta = comparar(client, token_rh, [a.id, b.id])
        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert set(datos) == {"total", "items"}
        for item in datos["items"]:
            assert set(item) == {
                "empleado_id",
                "nombre",
                "puesto",
                "area",
                "competencias",
                "experiencia",
            }
        texto = str(datos).lower()
        for prohibido in (
            "nine_box",
            "ninebox",
            "9box",
            "9-box",
            "ganador",
            "winner",
            "mejor_empleado",
            "top",
            "ranking",
            "posicion",
            "score_global",
            "promedio_global",
            "recomendacion",
            "recomendación",
            "mentor",
            "groq",
            "gemini",
            "langchain",
        ):
            assert prohibido not in texto, prohibido
        # Sin score/promedio GLOBAL: ni en la raíz ni como clave por
        # empleado (la ``evidencia`` interna por competencia del engine
        # es el contrato existente del ResultadoActual, no un score de
        # comparación).
        assert not any("score" in clave for clave in datos)
        for item in datos["items"]:
            assert not any(
                "score" in clave or "promedio" in clave for clave in item
            )


class TestOrdenYExactitud:
    """Tests 23–24 + casos extra de neutralidad."""

    def test_resultado_exacto_a_ids_solicitados(self, client, token_rh, db):
        a = sembrar(db, "Solicitada")
        b = sembrar(db, "Solicitado")
        c = sembrar(db, "Fuera")
        datos = comparar(client, token_rh, [b.id, a.id]).json()
        assert {i["empleado_id"] for i in datos["items"]} == {a.id, b.id}
        assert c.id not in {i["empleado_id"] for i in datos["items"]}

    def test_orden_conserva_employee_ids(self, client, token_rh, db):
        a = sembrar(db, "Primera")
        b = sembrar(db, "Segundo")
        ids = [b.id, a.id]  # deliberadamente NO ascendente
        datos = comparar(client, token_rh, ids).json()
        assert [i["empleado_id"] for i in datos["items"]] == ids

    def test_experiencias_diferentes_no_alteran_orden(
        self, client, token_rh, db
    ):
        novato = sembrar(db, "Novato", anios_antiguedad=0)
        veterano = sembrar(db, "Veterano", anios_antiguedad=30)
        datos = comparar(client, token_rh, [novato.id, veterano.id]).json()
        assert [i["empleado_id"] for i in datos["items"]] == [
            novato.id,
            veterano.id,
        ]

    def test_niveles_distintos_no_producen_ranking(self, client, token_rh, db):
        bajo = sembrar(db, "Bajo", verdaderos=0)  # liderazgo nivel 1
        alto = sembrar(db, "Alto", verdaderos=3)  # liderazgo nivel 5
        datos = comparar(client, token_rh, [bajo.id, alto.id]).json()
        assert [i["empleado_id"] for i in datos["items"]] == [bajo.id, alto.id]

    def test_di_junto_a_niveles_numericos(self, client, token_rh, db):
        di = sembrar(db, "ConDi", participaciones=2)
        calculable = sembrar(db, "ConNivel", verdaderos=3)
        datos = comparar(client, token_rh, [di.id, calculable.id]).json()
        item_di = next(i for i in datos["items"] if i["empleado_id"] == di.id)
        item_nivel = next(
            i for i in datos["items"] if i["empleado_id"] == calculable.id
        )
        liderazgo_di = next(
            c for c in item_di["competencias"] if c["clave"] == "liderazgo"
        )
        liderazgo_nivel = next(
            c for c in item_nivel["competencias"] if c["clave"] == "liderazgo"
        )
        assert liderazgo_di["estado"] == "INSUFFICIENT_DATA"
        assert liderazgo_di["nivel"] is None
        assert liderazgo_nivel["estado"] == "CALCULABLE"
        assert liderazgo_nivel["nivel"] == 5


class TestDerivadaYNoPersistente:
    """Tests 19–21: sin persistencia, sensible a datos actuales."""

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

    def test_cero_persistencia(self, client, token_rh, db):
        a = sembrar(db, "Estable")
        b = sembrar(db, "EstableDos")
        antes = self._conteos(db)
        primera = comparar(client, token_rh, [a.id, b.id])
        segunda = comparar(client, token_rh, [b.id, a.id])
        assert primera.status_code == segunda.status_code == 200
        assert primera.json()["items"] == list(reversed(segunda.json()["items"]))
        assert antes == self._conteos(db)  # cero escrituras, sin Comparison

    def test_cambiar_datos_actuales_cambia_comparacion(
        self, client, token_rh, db
    ):
        di = sembrar(db, "Cambia", participaciones=2)
        testigo = sembrar(db, "TestigoCambio")
        antes = comparar(client, token_rh, [di.id, testigo.id]).json()
        liderazgo = next(
            c
            for i in antes["items"]
            if i["empleado_id"] == di.id
            for c in i["competencias"]
            if c["clave"] == "liderazgo"
        )
        assert liderazgo["estado"] == "INSUFFICIENT_DATA"

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

        despues = comparar(client, token_rh, [di.id, testigo.id]).json()
        liderazgo_nuevo = next(
            c
            for i in despues["items"]
            if i["empleado_id"] == di.id
            for c in i["competencias"]
            if c["clave"] == "liderazgo"
        )
        assert liderazgo_nuevo["estado"] == "CALCULABLE"  # 3/3 → nivel 5
        assert liderazgo_nuevo["nivel"] == 5

    def test_evaluaciones_historicas_no_alteran(
        self, client, token_rh, cuenta_rh, db
    ):
        a = sembrar(db, "Historico")
        b = sembrar(db, "Historica")
        antes = comparar(client, token_rh, [a.id, b.id]).json()

        snapshot = {
            "periodo": "2020-Q1",
            "generado_por_cuenta_id": cuenta_rh.id,
        }
        for codigo in CLAVES:
            snapshot[f"{codigo}_nivel"] = 5
            snapshot[f"{codigo}_status"] = "CALCULABLE"
        db.add(Evaluacion(empleado_id=a.id, **snapshot))
        db.commit()

        assert comparar(client, token_rh, [a.id, b.id]).json() == antes


class TestAcceso:
    """Tests 7–9: RBAC."""

    def test_rh_autorizado(self, client, token_rh, db):
        a = sembrar(db, "Permiso")
        b = sembrar(db, "Permisa")
        assert comparar(client, token_rh, [a.id, b.id]).status_code == 200

    def test_empleado_rechazado_403(self, client, token_empleado, db):
        a = sembrar(db, "Denegado")
        b = sembrar(db, "Denegada")
        assert comparar(client, token_empleado, [a.id, b.id]).status_code == 403

    def test_sin_token_401(self, client, db):
        a = sembrar(db, "Anonimo")
        b = sembrar(db, "Anonima")
        respuesta = client.post(
            URL_RH_COMPARACION, json={"employee_ids": [a.id, b.id]}
        )
        assert respuesta.status_code == 401
