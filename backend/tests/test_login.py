"""Tests de login y sesión (Fase 3, requisito 9)."""

from datetime import timedelta

from app.core.security import crear_access_token
from tests.helpers import (
    PASSWORD_PRUEBA,
    URL_LOGIN,
    URL_ME,
    cabecera,
    crear_cuenta,
    crear_empleado,
    login_y_token,
)


class TestLogin:
    def test_login_correcto(self, client, cuenta_empleado):
        respuesta = client.post(
            URL_LOGIN,
            json={"email": "empleado@empresa.dev", "password": PASSWORD_PRUEBA},
        )
        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["access_token"]
        assert datos["token_type"] == "bearer"
        assert datos["rol"] == "EMPLEADO"
        assert datos["must_change_password"] is False

    def test_login_normaliza_email_case_insensitive(self, client, cuenta_empleado):
        """El email es único sin distinguir mayúsculas/minúsculas (§4.1)."""
        respuesta = client.post(
            URL_LOGIN,
            json={"email": "  EMPLEADO@Empresa.DEV ", "password": PASSWORD_PRUEBA},
        )
        assert respuesta.status_code == 200

    def test_login_password_incorrecta_rechazado(self, client, cuenta_empleado):
        respuesta = client.post(
            URL_LOGIN,
            json={"email": "empleado@empresa.dev", "password": "Incorrecta9"},
        )
        assert respuesta.status_code == 401
        assert respuesta.json()["detail"] == "Credenciales inválidas."

    def test_login_email_inexistente_rechazado(self, client):
        respuesta = client.post(
            URL_LOGIN, json={"email": "nadie@empresa.dev", "password": "Incorrecta9"}
        )
        assert respuesta.status_code == 401
        # Mismo mensaje que contraseña incorrecta: sin enumeración de cuentas.
        assert respuesta.json()["detail"] == "Credenciales inválidas."

    def test_login_cuenta_inactiva_rechazado(self, client, db):
        empleado = crear_empleado(db)
        crear_cuenta(
            db,
            rol="EMPLEADO",
            email="inactivo@empresa.dev",
            empleado=empleado,
            activo=False,
        )
        respuesta = client.post(
            URL_LOGIN,
            json={"email": "inactivo@empresa.dev", "password": PASSWORD_PRUEBA},
        )
        assert respuesta.status_code == 401
        # Mismo mensaje uniforme: no se revela el estado de la cuenta.
        assert respuesta.json()["detail"] == "Credenciales inválidas."


class TestAccesoProtegido:
    def test_acceso_sin_autenticacion(self, client):
        respuesta = client.get(URL_ME)
        assert respuesta.status_code == 401

    def test_me_con_token_valido(self, client, cuenta_empleado):
        token = login_y_token(client, "empleado@empresa.dev")
        respuesta = client.get(URL_ME, headers=cabecera(token))
        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["cuenta_id"] == cuenta_empleado.id
        assert datos["email"] == "empleado@empresa.dev"
        assert datos["rol"] == "EMPLEADO"
        assert datos["empleado_id"] == cuenta_empleado.empleado_id
        assert datos["empleado_nombre"] == "Empleado Prueba"

    def test_token_firma_invalida_rechazado(self, client, cuenta_empleado):
        token = login_y_token(client, "empleado@empresa.dev") + "x"
        respuesta = client.get(URL_ME, headers=cabecera(token))
        assert respuesta.status_code == 401

    def test_token_expirado_rechazado(self, client, cuenta_empleado):
        token = crear_access_token(
            cuenta_id=cuenta_empleado.id,
            rol=cuenta_empleado.rol,
            empleado_id=cuenta_empleado.empleado_id,
            expires_delta=timedelta(minutes=-1),
        )
        respuesta = client.get(URL_ME, headers=cabecera(token))
        assert respuesta.status_code == 401

    def test_cuenta_desactivada_posterior_al_login(self, client, db, cuenta_empleado):
        """El token se revalida contra la BD: cuenta desactivada = 401 inmediato."""
        token = login_y_token(client, "empleado@empresa.dev")
        cuenta_empleado.activo = False
        db.commit()
        respuesta = client.get(URL_ME, headers=cabecera(token))
        assert respuesta.status_code == 401
