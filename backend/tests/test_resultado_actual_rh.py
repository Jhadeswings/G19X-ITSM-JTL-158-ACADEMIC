"""Tests del resultado actual por empleado para RH (ET §31; PRD §20.2, §42).

Endpoint: ``GET /api/v1/rh/employees/{empleado_id}/result``.

Cubre: RBAC (401 sin token, 403 Empleado, 200 RH), 404 si el empleado no
existe, contrato exacto del ``ResultadoActualDTO`` (cinco competencias en
orden del engine, DI preservado con ``nivel`` nulo y nunca 0,
fortalezas/oportunidades deterministas §19, experiencia como contexto §17),
NEUTRALIDAD respecto al estado administrativo del empleado (el PRD y la
Especificación no definen reglas por ``Empleado.activo``), ausencia de
9-Box/ranking/score global/IA, cero persistencia, sensibilidad al estado
actual y neutralidad frente a la evaluación histórica.

Perfil de siembra (mismo criterio que la suite de comparación):
``verdaderos`` marca coordino_tareas/en_equipo/explico_a_publico_distinto.
Con 3 participaciones y 3 proyectos COMPLETADO el perfil esperado es
[5, 5, 5, 5, 3] (aprendizaje: 3 roles distintos y 3 proyectos únicos ⇒
componente A=4, componente B=1, score 2.8 ⇒ nivel 3); con ``verdaderos=1``
las tres competencias booleanas quedan en nivel 2 y con menos de 3
participaciones todo queda en INSUFFICIENT_DATA.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import text

from app.core.fechas import fecha_negocio_hoy
from app.models.evaluacion import Evaluacion
from app.models.participacion import Participacion
from app.models.proyecto import Proyecto
from tests.helpers import (
    URL_RH_EMPLEADO_RESULTADO,
    cabecera,
    crear_empleado,
    login_y_token,
)


ANIO = fecha_negocio_hoy().year

# Orden EXACTO de las cinco competencias (§16). Experiencia NO es competencia.
CLAVES = (
    "desempeno_tecnico",
    "liderazgo",
    "trabajo_equipo",
    "comunicacion",
    "aprendizaje",
)

DI = "INSUFFICIENT_DATA"
CALCULABLE = "CALCULABLE"


def sembrar(
    db,
    nombre,
    *,
    verdaderos=3,
    participaciones=3,
    activo=True,
    anios_antiguedad=1,
):
    """Empleado con evidencias controladas (3 proyectos COMPLETADO por defecto)."""
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


def url_resultado(empleado_id):
    return URL_RH_EMPLEADO_RESULTADO.format(empleado_id=empleado_id)


def pedir(client, token, id_empleado, **params):
    consulta = "&".join(f"{clave}={valor}" for clave, valor in params.items())
    url = url_resultado(id_empleado) + (f"?{consulta}" if consulta else "")
    return client.get(url, headers=cabecera(token))


def competencia(datos, clave):
    return next(c for c in datos["competencias"] if c["clave"] == clave)


@pytest.fixture()
def token_rh(client, cuenta_rh):
    return login_y_token(client, "rh@empresa.dev")


@pytest.fixture()
def token_empleado(client, cuenta_empleado):
    return login_y_token(client, "empleado@empresa.dev")


class TestAcceso:
    """RBAC y recurso inexistente (ET §31/§32)."""

    def test_rh_autorizado(self, client, token_rh, db):
        empleado = sembrar(db, "Permiso")
        respuesta = pedir(client, token_rh, empleado.id)
        assert respuesta.status_code == 200, respuesta.text
        assert respuesta.json()["empleado_id"] == empleado.id

    def test_empleado_rechazado_403(self, client, token_empleado, db):
        empleado = sembrar(db, "Denegado")
        assert pedir(client, token_empleado, empleado.id).status_code == 403

    def test_sin_token_401(self, client, db):
        empleado = sembrar(db, "Anonimo")
        assert client.get(url_resultado(empleado.id)).status_code == 401

    def test_empleado_inexistente_404(self, client, token_rh):
        respuesta = pedir(client, token_rh, 99999)
        assert respuesta.status_code == 404
        assert "Empleado no encontrado" in respuesta.json()["detail"]


class TestContrato:
    """Contrato exacto del ResultadoActualDTO (ET §13–§19, §36)."""

    def test_cinco_competencias_en_orden(self, client, token_rh, db):
        empleado = sembrar(db, "Cinco")
        datos = pedir(client, token_rh, empleado.id).json()
        assert [c["clave"] for c in datos["competencias"]] == list(CLAVES)
        assert len(datos["competencias"]) == 5

    def test_perfil_calculable_niveles_exactos(self, client, token_rh, db):
        empleado = sembrar(db, "Calculable")
        datos = pedir(client, token_rh, empleado.id).json()
        assert [c["nivel"] for c in datos["competencias"]] == [5, 5, 5, 5, 3]
        for c in datos["competencias"]:
            assert c["estado"] == CALCULABLE
        # Valor porcentual del engine intacto (Decimal, §15).
        liderazgo = competencia(datos, "liderazgo")
        assert Decimal(str(liderazgo["valor"])) == Decimal("100.00")
        assert Decimal(str(liderazgo["evidencia"]["coordino_tareas_true"])) == 3
        assert liderazgo["etiqueta"] == "Alto"
        assert competencia(datos, "aprendizaje")["etiqueta"] == "En crecimiento"

    def test_datos_insuficientes_preservado_nunca_cero(
        self, client, token_rh, db
    ):
        empleado = sembrar(db, "Insuficiente", participaciones=2)
        datos = pedir(client, token_rh, empleado.id).json()
        assert datos["fortalezas"] == []
        assert datos["oportunidades"] == []
        for c in datos["competencias"]:
            assert c["estado"] == DI
            assert c["nivel"] is None  # jamás 0
            assert c["valor"] is None
            assert c["etiqueta"] is None

    def test_fortalezas_y_oportunidades_por_reglas(self, client, token_rh, db):
        """§19: 4–5 fortaleza, 1–2 oportunidad, 3 ninguna, DI excluida."""
        fuerte = sembrar(db, "Fuerte")  # [5, 5, 5, 5, 3]
        mixto = sembrar(db, "Mixto", verdaderos=1)  # [5, 2, 2, 2, 3]

        datos_fuerte = pedir(client, token_rh, fuerte.id).json()
        assert datos_fuerte["fortalezas"] == [
            "desempeno_tecnico",
            "liderazgo",
            "trabajo_equipo",
            "comunicacion",
        ]
        assert datos_fuerte["oportunidades"] == []
        # Nivel 3 no es fortaleza ni oportunidad.
        assert "aprendizaje" not in datos_fuerte["fortalezas"]
        assert "aprendizaje" not in datos_fuerte["oportunidades"]

        datos_mixto = pedir(client, token_rh, mixto.id).json()
        assert datos_mixto["fortalezas"] == ["desempeno_tecnico"]
        assert datos_mixto["oportunidades"] == [
            "liderazgo",
            "trabajo_equipo",
            "comunicacion",
        ]

    def test_experiencia_como_contexto(self, client, token_rh, db):
        veterana = sembrar(db, "Veterana", anios_antiguedad=20)
        datos = pedir(client, token_rh, veterana.id).json()
        experiencia = datos["experiencia"]
        assert set(experiencia) == {
            "fecha_ingreso",
            "anios_antiguedad",
            "proyectos_unicos",
        }
        assert experiencia["proyectos_unicos"] == 3
        assert float(experiencia["anios_antiguedad"]) >= 19
        assert experiencia["fecha_ingreso"] is not None

    def test_estructura_sin_ruido(self, client, token_rh, db):
        empleado = sembrar(db, "Estructura")
        datos = pedir(client, token_rh, empleado.id).json()
        assert set(datos) == {
            "empleado_id",
            "competencias",
            "experiencia",
            "fortalezas",
            "oportunidades",
        }
        assert set(datos["competencias"][0]) == {
            "clave",
            "estado",
            "nivel",
            "valor",
            "etiqueta",
            "evidencia",
        }

    def test_sin_9box_ranking_score_global_ni_ia(self, client, token_rh, db):
        """Sin 9-Box (solo histórico), sin ranking/ganador y sin IA (ET §42)."""
        empleado = sembrar(db, "Limpio")
        datos = pedir(client, token_rh, empleado.id).json()
        texto = str(datos).lower()
        for prohibido in (
            "nine_box",
            "ninebox",
            "9box",
            "9-box",
            "performance_axis",
            "potential_axis",
            "box_code",
            "ranking",
            "ganador",
            "winner",
            "top",
            "mejor_empleado",
            "recomendacion",
            "recomendación",
            "groq",
            "gemini",
            "langchain",
            "origen",
        ):
            assert prohibido not in texto, prohibido
        # Sin score/promedio GLOBAL: la ``evidencia`` del engine es el
        # contrato existente del ResultadoActual, no un score de ranking.
        assert not any("score" in clave for clave in datos)
        assert not any("promedio" in clave for clave in datos)

    def test_empleado_id_solo_desde_la_ruta(self, client, token_rh, db):
        """El cliente no puede alterar el resultado: query inyectada ignorada."""
        objetivo = sembrar(db, "Objetivo")
        otro = sembrar(db, "Otro")
        datos = pedir(
            client,
            token_rh,
            objetivo.id,
            empleado_id=otro.id,
            nivel=5,
            fortalezas="desempeno_tecnico",
        ).json()
        assert datos["empleado_id"] == objetivo.id
        assert [c["nivel"] for c in datos["competencias"]] == [5, 5, 5, 5, 3]


class TestDerivadaYNoPersistente:
    """Sin persistencia, sensible al estado actual y ajena al histórico."""

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
        empleado = sembrar(db, "Estable")
        antes = self._conteos(db)
        primera = pedir(client, token_rh, empleado.id)
        segunda = pedir(client, token_rh, empleado.id)
        assert primera.status_code == segunda.status_code == 200
        assert primera.json() == segunda.json()  # determinista
        assert antes == self._conteos(db)  # cero escrituras, sin tabla nueva

    def test_cambiar_datos_actuales_cambia_resultado(self, client, token_rh, db):
        empleado = sembrar(db, "Cambia", participaciones=2)
        antes = pedir(client, token_rh, empleado.id).json()
        assert competencia(antes, "liderazgo")["estado"] == DI

        proyecto = Proyecto(
            nombre=f"Cierre-{empleado.id}",
            nombre_normalizado=f"cierre-{empleado.id}",
            estado="COMPLETADO",
        )
        db.add(proyecto)
        db.flush()
        db.add(
            Participacion(
                empleado_id=empleado.id,
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

        despues = pedir(client, token_rh, empleado.id).json()
        liderazgo = competencia(despues, "liderazgo")
        assert liderazgo["estado"] == CALCULABLE  # 3/3 → nivel 5
        assert liderazgo["nivel"] == 5

    def test_evaluacion_historica_no_altera_resultado(
        self, client, token_rh, cuenta_rh, db
    ):
        """El histórico es snapshot inmutable (§21/§24): no recalcula nada."""
        empleado = sembrar(db, "Historico")
        antes = pedir(client, token_rh, empleado.id).json()

        snapshot = {
            "periodo": "2020-Q1",
            "generado_por_cuenta_id": cuenta_rh.id,
        }
        for clave in CLAVES:
            snapshot[f"{clave}_nivel"] = 1
            snapshot[f"{clave}_status"] = CALCULABLE
        db.add(Evaluacion(empleado_id=empleado.id, **snapshot))
        db.commit()

        assert pedir(client, token_rh, empleado.id).json() == antes

    def test_estado_del_empleado_no_cambia_el_contrato(
        self, client, token_rh, db
    ):
        """El estado administrativo no participa en el cálculo (§18/§19).

        Ni el PRD ni la Especificación definen reglas por ``Empleado.activo``
        para el ResultadoActual: el resultado se deriva de participaciones,
        proyectos y capacitaciones vigentes, así que el mismo perfil de
        evidencias produce el mismo contrato y los mismos niveles con el
        empleado activo o inactivo. No se inventa ninguna respuesta especial.
        """
        activo = sembrar(db, "Activo")
        inactivo = sembrar(db, "Inactivo", activo=False)

        respuesta_activo = pedir(client, token_rh, activo.id)
        respuesta_inactivo = pedir(client, token_rh, inactivo.id)
        assert respuesta_activo.status_code == 200
        assert respuesta_inactivo.status_code == 200

        datos_activo = respuesta_activo.json()
        datos_inactivo = respuesta_inactivo.json()
        assert datos_inactivo["empleado_id"] == inactivo.id
        assert datos_inactivo["competencias"] == datos_activo["competencias"]
        assert [c["nivel"] for c in datos_inactivo["competencias"]] == [
            5,
            5,
            5,
            5,
            3,
        ]

    def test_desactivar_empleado_conserva_contrato(self, client, token_rh, db):
        empleado = sembrar(db, "SeRetira")
        antes = pedir(client, token_rh, empleado.id)
        assert antes.status_code == 200

        empleado.activo = False
        db.commit()

        despues = pedir(client, token_rh, empleado.id)
        assert despues.status_code == 200
        assert despues.json() == antes.json()

