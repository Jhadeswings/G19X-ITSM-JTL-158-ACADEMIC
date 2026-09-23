"""Tests básicos anti-IDOR (Fase 3, requisito 9).

Base reutilizable de ownership (Especificación Técnica §32): el recurso
siempre se resuelve desde la cuenta autenticada, nunca desde datos del
cliente. No se inventan reglas de módulos que aún no existen.
"""

import pytest
from fastapi import HTTPException

from app.api import deps
from tests.helpers import (
    PASSWORD_PRUEBA,
    URL_CAMBIO,
    URL_ME,
    URL_LOGIN,
    cabecera,
    crear_cuenta,
    crear_empleado,
    login_y_token,
)


class TestBaseOwnership:
    """Helpers reutilizables de §32 (para las fases de negocio futuras)."""

    def test_verificar_pertenencia_rechaza_recurso_ajeno(self, cuenta_empleado):
        with pytest.raises(HTTPException) as info:
            deps.verificar_pertenencia(
                cuenta_empleado, empleado_id_recurso=cuenta_empleado.empleado_id + 999
            )
        # 404 (no 403): no revela la existencia del recurso ajeno.
        assert info.value.status_code == 404

    def test_verificar_pertenencia_acepta_recurso_propio(self, cuenta_empleado):
        deps.verificar_pertenencia(
            cuenta_empleado, empleado_id_recurso=cuenta_empleado.empleado_id
        )

    def test_empleado_id_propio_rechaza_rh_sin_vinculo(self, cuenta_rh):
        with pytest.raises(HTTPException) as info:
            deps.empleado_id_propio(cuenta_rh)
        assert info.value.status_code == 403


class TestAccesoIndebidoEntreCuentas:
    def _dos_cuentas(self, db):
        empleado_a = crear_empleado(db, nombre="Empleado A")
        empleado_b = crear_empleado(db, nombre="Empleado B")
        cuenta_a = crear_cuenta(
            db, rol="EMPLEADO", email="a@empresa.dev", empleado=empleado_a
        )
        cuenta_b = crear_cuenta(
            db, rol="EMPLEADO", email="b@empresa.dev", empleado=empleado_b
        )
        return cuenta_a, cuenta_b

    def test_cambio_de_password_no_afecta_cuenta_ajena(self, client, db):
        """El endpoint no acepta identificador de cuenta: identidad solo del token."""
        cuenta_a, cuenta_b = self._dos_cuentas(db)
        token_a = login_y_token(client, "a@empresa.dev")

        respuesta = client.post(
            URL_CAMBIO,
            json={"password_actual": PASSWORD_PRUEBA, "password_nueva": "Nueva1234"},
            headers=cabecera(token_a),
        )
        assert respuesta.status_code == 200

        # A cambia; B sigue intacta aunque un atacante conociera todos los IDs.
        assert client.post(
            URL_LOGIN, json={"email": "a@empresa.dev", "password": "Nueva1234"}
        ).status_code == 200
        assert client.post(
            URL_LOGIN, json={"email": "b@empresa.dev", "password": PASSWORD_PRUEBA}
        ).status_code == 200
        _ = (cuenta_a, cuenta_b)

    def test_me_no_expone_datos_de_otra_cuenta(self, client, db):
        """Aunque B conozca el cuenta_id/empleado_id de A, solo ve lo suyo."""
        cuenta_a, cuenta_b = self._dos_cuentas(db)
        _ = cuenta_a
        token_b = login_y_token(client, "b@empresa.dev")

        respuesta = client.get(URL_ME, headers=cabecera(token_b))
        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["cuenta_id"] == cuenta_b.id
        assert datos["empleado_id"] == cuenta_b.empleado_id
        assert datos["email"] == "b@empresa.dev"

        # El identity del path/param no existe: la identidad es solo del token.
        respuesta_ajena = client.get(
            f"{URL_ME}?cuenta_id={cuenta_a.id}&empleado_id={cuenta_a.empleado_id}",
            headers=cabecera(token_b),
        )
        assert respuesta_ajena.status_code == 200
        assert respuesta_ajena.json()["cuenta_id"] == cuenta_b.id
