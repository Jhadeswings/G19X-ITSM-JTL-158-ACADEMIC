"""Tests del 9-Box vigente por empleado para RH (ET §20/§31; PRD §10, §20.2).

Endpoint: ``GET /api/v1/rh/employees/{empleado_id}/nine-box``.

Cubre: RBAC (401 sin token, 403 Empleado, 200 RH), 404 si el empleado no
existe, equivalencia EXACTA con ``calcular_nine_box`` alimentado por
``obtener_resultado_actual`` (prueba de que no hay fórmula duplicada, §13), DI
en cualquiera de las cinco competencias ⇒ los cinco campos en ``null``
(§20.2), separación de contratos (``/result`` sigue SIN 9-Box) y la NO
afectación del 9-Box histórico guardado (DECISIONES §30).
"""

from datetime import date, timedelta

import pytest

from app.core.fechas import fecha_negocio_hoy
from app.models.participacion import Participacion
from app.models.proyecto import Proyecto
from app.services.nine_box import calcular_nine_box
from app.services.resultado_actual_service import obtener_resultado_actual
from tests.helpers import (
    URL_RH_EMPLEADO_NINE_BOX,
    URL_RH_EMPLEADO_RESULTADO,
    URL_RH_GENERAR_EVALUACIONES,
    cabecera,
    crear_empleado,
    login_y_token,
)

ANIO = fecha_negocio_hoy().year
CLAVES = (
    "desempeno_tecnico",
    "liderazgo",
    "trabajo_equipo",
    "comunicacion",
    "aprendizaje",
)


def sembrar(db, nombre, *, verdaderos=3, participaciones=3):
    """Empleado con evidencias controladas (3 proyectos COMPLETADO por defecto)."""
    empleado = crear_empleado(db, nombre=nombre)
    empleado.fecha_ingreso = fecha_negocio_hoy() - timedelta(days=365)
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


def url_nine_box(empleado_id):
    return URL_RH_EMPLEADO_NINE_BOX.format(empleado_id=empleado_id)


@pytest.fixture()
def token_rh(client, cuenta_rh):
    return login_y_token(client, "rh@empresa.dev")


@pytest.fixture()
def token_empleado(client, cuenta_empleado):
    return login_y_token(client, "empleado@empresa.dev")


class TestAcceso:
    """RBAC y recurso inexistente, idénticos a ``/result`` (ET §31/§32)."""

    def test_rh_autorizado(self, client, token_rh, db):
        empleado = sembrar(db, "Permiso")
        respuesta = client.get(url_nine_box(empleado.id), headers=cabecera(token_rh))
        assert respuesta.status_code == 200, respuesta.text

    def test_empleado_rechazado_403(self, client, token_empleado, db):
        empleado = sembrar(db, "Denegado")
        respuesta = client.get(
            url_nine_box(empleado.id), headers=cabecera(token_empleado)
        )
        assert respuesta.status_code == 403

    def test_sin_token_401(self, client, db):
        empleado = sembrar(db, "Anonimo")
        assert client.get(url_nine_box(empleado.id)).status_code == 401

    def test_empleado_inexistente_404(self, client, token_rh):
        respuesta = client.get(url_nine_box(99999), headers=cabecera(token_rh))
        assert respuesta.status_code == 404
        assert "Empleado no encontrado" in respuesta.json()["detail"]


class TestContrato:
    """Contrato exacto del ``NineBoxDTO`` vigente (§20)."""

    def test_cinco_campos_del_dto(self, client, token_rh, db):
        empleado = sembrar(db, "Campos")
        datos = client.get(url_nine_box(empleado.id), headers=cabecera(token_rh)).json()
        assert set(datos) == {
            "performance_axis",
            "potential_axis",
            "box_code",
            "etiqueta_performance",
            "etiqueta_potencial",
        }

    def test_coincide_con_calcular_nine_box_del_resultado_actual(
        self, client, token_rh, db
    ):
        """Prueba de que NO hay fórmula duplicada (§13)."""
        for nombre, verdaderos in (("Alto", 3), ("Medio", 1)):
            empleado = sembrar(db, nombre, verdaderos=verdaderos)
            respuesta = client.get(url_nine_box(empleado.id), headers=cabecera(token_rh))
            assert respuesta.status_code == 200, respuesta.text
            # La respuesta llega serializada a JSON: compara contra el DTO
            # serializado en el mismo modo para no mezclar Decimal con str.
            esperado = calcular_nine_box(
                obtener_resultado_actual(db, empleado.id).competencias
            ).model_dump(mode="json")
            assert respuesta.json() == {
                "performance_axis": esperado["performance_axis"],
                "potential_axis": esperado["potential_axis"],
                "box_code": esperado["box_code"],
                "etiqueta_performance": esperado["etiqueta_performance"],
                "etiqueta_potencial": esperado["etiqueta_potencial"],
            }

    @pytest.mark.parametrize("clave", CLAVES)
    def test_di_en_cualquiera_de_las_cinco_deja_los_cinco_null(
        self, clave, client, token_rh, db
    ):
        """Con menos de 3 participaciones TODO queda en DI (§20.2)."""
        empleado = sembrar(db, f"DI-{clave}", participaciones=1)
        datos = client.get(url_nine_box(empleado.id), headers=cabecera(token_rh)).json()
        assert datos == {
            "performance_axis": None,
            "potential_axis": None,
            "box_code": None,
            "etiqueta_performance": None,
            "etiqueta_potencial": None,
        }

    def test_lectura_no_persiste_nada(self, client, token_rh, db):
        """Es una lectura bajo demanda: no crea ni modifica evaluaciones."""
        from sqlalchemy import text

        empleado = sembrar(db, "SinPersistencia")
        antes = db.scalar(text("SELECT COUNT(*) FROM evaluaciones"))
        client.get(url_nine_box(empleado.id), headers=cabecera(token_rh))
        db.expire_all()
        assert db.scalar(text("SELECT COUNT(*) FROM evaluaciones")) == antes


class TestSeparacionDeContratos:
    """``/result`` y el 9-Box histórico NO se contaminan (§42, DECISIONES §30)."""

    def test_result_actual_sigue_sin_9box(self, client, token_rh, db):
        empleado = sembrar(db, "SinNueveBox")
        url = URL_RH_EMPLEADO_RESULTADO.format(empleado_id=empleado.id)
        texto = str(client.get(url, headers=cabecera(token_rh)).json()).lower()
        for prohibido in (
            "nine_box",
            "ninebox",
            "9box",
            "9-box",
            "performance_axis",
            "potential_axis",
            "box_code",
        ):
            assert prohibido not in texto, prohibido

    def test_lectura_historica_conserva_el_9box_guardado(self, client, token_rh, db):
        """Generar el snapshot NO altera lo que devuelve ``/nine-box``."""
        empleado = sembrar(db, "Historico")
        generado = client.post(
            URL_RH_GENERAR_EVALUACIONES, headers=cabecera(token_rh)
        )
        assert generado.status_code in (200, 201), generado.text

        vigente = client.get(
            url_nine_box(empleado.id), headers=cabecera(token_rh)
        ).json()
        historico = client.get(
            URL_RH_EMPLEADO_RESULTADO.replace("/result", "/evaluations").format(
                empleado_id=empleado.id
            ),
            headers=cabecera(token_rh),
        ).json()
        guardado = historico["items"][0]["nine_box"]

        # Mismo origen de verdad: snapshot y lectura vigente coinciden.
        assert guardado["box_code"] == vigente["box_code"]
        assert guardado["etiqueta_performance"] == vigente["etiqueta_performance"]
        assert guardado["etiqueta_potencial"] == vigente["etiqueta_potencial"]
        # Y el histórico conserva su periodo y sigue siendo un snapshot.
        assert historico["items"][0]["periodo"]