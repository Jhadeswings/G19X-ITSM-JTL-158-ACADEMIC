"""Tests de autorización RBAC (Fase 3, requisito 9).

``require_rh`` y ``require_empleado`` se prueban directamente como
dependencias (sin crear rutas ficticias): el endpoint protegido real de
esta fase es ``GET /api/v1/me`` (autenticado).
"""

import pytest
from fastapi import HTTPException

from app.api import deps
from tests.helpers import URL_ME, cabecera, crear_cuenta, login_y_token


class TestRequireRH:
    def test_permite_cuenta_rh(self, cuenta_rh):
        resultado = deps.require_rh(cuenta=cuenta_rh)
        assert resultado is cuenta_rh

    def test_rechaza_cuenta_empleado(self, cuenta_empleado):
        with pytest.raises(HTTPException) as info:
            deps.require_rh(cuenta=cuenta_empleado)
        assert info.value.status_code == 403


class TestRequireEmpleado:
    def test_permite_cuenta_empleado_con_vinculo(self, cuenta_empleado):
        resultado = deps.require_empleado(cuenta=cuenta_empleado)
        assert resultado is cuenta_empleado

    def test_rechaza_cuenta_rh(self, cuenta_rh):
        with pytest.raises(HTTPException) as info:
            deps.require_empleado(cuenta=cuenta_rh)
        assert info.value.status_code == 403

    def test_rechaza_cuenta_empleado_sin_vinculo(self, db):
        """EMPLEADO sin empleado_id es un estado inválido para /me/* (§4.1)."""
        cuenta = crear_cuenta(db, rol="EMPLEADO", email="huerfana@empresa.dev")
        with pytest.raises(HTTPException) as info:
            deps.require_empleado(cuenta=cuenta)
        assert info.value.status_code == 403


class TestEndpointProtegidoReal:
    """GET /api/v1/me es el único endpoint protegido real de esta fase."""

    def test_sin_token_rechazado(self, client):
        assert client.get(URL_ME).status_code == 401

    @pytest.mark.parametrize("email", ["rh@empresa.dev", "empleado@empresa.dev"])
    def test_accesible_para_ambos_roles_autenticados(
        self, client, cuenta_rh, cuenta_empleado, email
    ):
        token = login_y_token(client, email)
        respuesta = client.get(URL_ME, headers=cabecera(token))
        assert respuesta.status_code == 200
        assert respuesta.json()["email"] == email
