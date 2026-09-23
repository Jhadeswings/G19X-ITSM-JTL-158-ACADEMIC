"""Tests de capacitaciones (Fase 4B).

Operaciones respaldadas por los documentos (PRD §21.4, Especificación
§11, §31): registrar, listar propias, consultar propia. NO existen PATCH,
DELETE ni endpoints RH.
"""

import pytest

from tests.helpers import (
    URL_ME_CAPACITACIONES,
    cabecera,
    crear_cuenta,
    crear_empleado,
    login_y_token,
)


@pytest.fixture()
def token_empleado(client, cuenta_empleado):
    return login_y_token(client, "empleado@empresa.dev")


@pytest.fixture()
def token_empleado_b(client, db):
    empleado_b = crear_empleado(db, nombre="Empleado B")
    crear_cuenta(db, rol="EMPLEADO", email="b@empresa.dev", empleado=empleado_b)
    return login_y_token(client, "b@empresa.dev")


@pytest.fixture()
def token_rh(client, cuenta_rh):
    return login_y_token(client, "rh@empresa.dev")


class TestCrearCapacitacion:
    def test_crear_propia(self, client, token_empleado, cuenta_empleado):
        respuesta = client.post(
            URL_ME_CAPACITACIONES,
            json={"nombre": "Curso de Python", "fecha": "2026-03-10", "completado": True},
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 201, respuesta.text
        datos = respuesta.json()
        assert datos["empleado_id"] == cuenta_empleado.empleado_id
        assert datos["completado"] is True

    def test_completado_por_defecto_false(self, client, token_empleado):
        respuesta = client.post(
            URL_ME_CAPACITACIONES,
            json={"nombre": "Curso pendiente", "fecha": "2026-04-01"},
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 201
        assert respuesta.json()["completado"] is False

    def test_empleado_id_del_cliente_rechazado(self, client, token_empleado):
        respuesta = client.post(
            URL_ME_CAPACITACIONES,
            json={"nombre": "Curso", "fecha": "2026-04-01", "empleado_id": 99},
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 422

    def test_fecha_invalida_rechazada(self, client, token_empleado):
        respuesta = client.post(
            URL_ME_CAPACITACIONES,
            json={"nombre": "Curso", "fecha": "no-es-fecha"},
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 422

    def test_nombre_vacio_rechazado(self, client, token_empleado):
        respuesta = client.post(
            URL_ME_CAPACITACIONES,
            json={"nombre": "   ", "fecha": "2026-04-01"},
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 422

    def test_rh_no_puede_registrar(self, client, token_rh):
        respuesta = client.post(
            URL_ME_CAPACITACIONES,
            json={"nombre": "Curso", "fecha": "2026-04-01"},
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 403

    def test_sin_token_401(self, client):
        assert client.post(
            URL_ME_CAPACITACIONES, json={"nombre": "Curso", "fecha": "2026-04-01"}
        ).status_code == 401


class TestConsultarYListar:
    @pytest.fixture()
    def propia(self, client, token_empleado):
        respuesta = client.post(
            URL_ME_CAPACITACIONES,
            json={"nombre": "Curso de Python", "fecha": "2026-03-10", "completado": True},
            headers=cabecera(token_empleado),
        )
        return respuesta.json()

    def test_consultar_propia(self, client, token_empleado, propia):
        respuesta = client.get(
            f"{URL_ME_CAPACITACIONES}/{propia['id']}", headers=cabecera(token_empleado)
        )
        assert respuesta.status_code == 200
        assert respuesta.json()["nombre"] == "Curso de Python"

    def test_consultar_ajena_404(self, client, token_empleado_b, propia):
        """IDOR: capacitación ajena → 404 uniforme (§32)."""
        respuesta = client.get(
            f"{URL_ME_CAPACITACIONES}/{propia['id']}",
            headers=cabecera(token_empleado_b),
        )
        assert respuesta.status_code == 404

    def test_listar_solo_propias(self, client, token_empleado, token_empleado_b, propia):
        for nombre in ("Curso A", "Curso B"):
            client.post(
                URL_ME_CAPACITACIONES,
                json={"nombre": nombre, "fecha": "2026-05-01"},
                headers=cabecera(token_empleado_b),
            )
        lista_b = client.get(
            URL_ME_CAPACITACIONES, headers=cabecera(token_empleado_b)
        ).json()
        assert lista_b["total"] == 2  # nunca aparecen las de A

        lista_a = client.get(
            URL_ME_CAPACITACIONES, headers=cabecera(token_empleado)
        ).json()
        assert lista_a["total"] == 1

    def test_rh_no_puede_usar_rutas_me(self, client, token_rh, propia):
        assert client.get(
            URL_ME_CAPACITACIONES, headers=cabecera(token_rh)
        ).status_code == 403
        assert client.get(
            f"{URL_ME_CAPACITACIONES}/{propia['id']}", headers=cabecera(token_rh)
        ).status_code == 403


class TestContratoRestringido:
    """La documentación NO define edición ni eliminación de capacitaciones."""

    def test_no_existe_patch(self, client, token_empleado, propia=None):
        respuesta = client.patch(
            f"{URL_ME_CAPACITACIONES}/1",
            json={"completado": True},
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code in (404, 405)

    def test_no_existe_delete(self, client, token_empleado):
        respuesta = client.delete(
            f"{URL_ME_CAPACITACIONES}/1", headers=cabecera(token_empleado)
        )
        assert respuesta.status_code in (404, 405)
