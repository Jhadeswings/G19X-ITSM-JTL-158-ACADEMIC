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


"""Renovación de sesión: `POST /auth/renew`.

Cubre el contrato mínimo de la renovación stateless del access token:

- renueva con token válido;
- NO renueva un token expirado ni revive una sesión caducada;
- una cuenta desactivada sigue dando 401;
- conserva rol/identidad correctos;
- el contrato de `POST /auth/login` no se rompe.

No hay tabla de sesiones ni refresh token: la renovación es exactamente
"reemite el access token", y todo lo que puede invalidarlo (firma, `exp`,
`activo`) lo decide la validación compartida de `app.api.deps`.
"""

from datetime import timedelta

from app.core.security import crear_access_token, decodificar_access_token
from tests.helpers import (
    PASSWORD_PRUEBA,
    URL_LOGIN,
    URL_ME,
    URL_RENOVAR,
    cabecera,
    crear_cuenta,
    crear_empleado,
    login_y_token,
)


def renovar(cliente, token):
    return cliente.post(URL_RENOVAR, headers=cabecera(token))


class TestRenovarSesion:
    def test_renueva_con_token_valido(self, client, cuenta_empleado):
        token = login_y_token(client, "empleado@empresa.dev")

        respuesta = renovar(client, token)

        assert respuesta.status_code == 200, respuesta.text
        datos = respuesta.json()
        assert datos["access_token"]
        # Mismo contrato exacto que login (se reutiliza sin tratarlo aparte).
        assert datos["token_type"] == "bearer"
        assert datos["rol"] == "EMPLEADO"
        assert datos["must_change_password"] is False

    def test_el_token_renovado_es_valido_y_extiende_la_vida(self, client, cuenta_empleado):
        """El token reemitido es válido y vuelve a dar la ventana completa.

        Nota de implementación: `iat`/`exp` de un JWT tienen resolución de
        SEGUNDO, así que renovar dentro del mismo segundo devuelve un token
        byte a byte idéntico al original. Eso es correcto (idempotente) y no
        debe tratarse como un fallo: la renovación solo tiene efecto visible
        cuando ha pasado al menos un segundo.
        """
        token = login_y_token(client, "empleado@empresa.dev")

        claims = decodificar_access_token(
            renovar(client, token).json()["access_token"]
        )

        # Vuelve a ser un token vigente con la ventana completa por delante.
        # `jwt.decode` entrega los claims numéricos como enteros.
        assert claims["exp"] > claims["iat"]
        assert claims["exp"] - claims["iat"] > 0

    def test_el_token_renovado_sigue_sirviendo(self, client, cuenta_empleado):
        """Renovar no produce un token huérfano: vale para /me como el original."""
        token = login_y_token(client, "empleado@empresa.dev")

        nuevo = renovar(client, token).json()["access_token"]

        assert client.get(URL_ME, headers=cabecera(nuevo)).status_code == 200

    def test_conserva_rol_e_identidad_del_empleado(self, client, cuenta_empleado):
        token = login_y_token(client, "empleado@empresa.dev")

        claims = decodificar_access_token(
            renovar(client, token).json()["access_token"]
        )

        assert claims["rol"] == "EMPLEADO"
        assert claims["empleado_id"] == cuenta_empleado.empleado_id

    def test_conserva_rol_de_rh(self, client, cuenta_rh):
        """La renovación es idéntica para los dos roles del sistema."""
        token = login_y_token(client, "rh@empresa.dev")

        datos = renovar(client, token).json()

        assert datos["rol"] == "RH"
        assert decodificar_access_token(datos["access_token"])["rol"] == "RH"

    def test_token_expirado_NO_se_renueva(self, client, cuenta_empleado):
        """Una sesión caducada no se revive: 401 y ningún token nuevo."""
        token = crear_access_token(
            cuenta_id=cuenta_empleado.id,
            rol=cuenta_empleado.rol,
            empleado_id=cuenta_empleado.empleado_id,
            expires_delta=timedelta(minutes=-1),
        )

        respuesta = renovar(client, token)

        assert respuesta.status_code == 401
        assert "access_token" not in respuesta.json()

    def test_sin_token_renovacion_rechazada(self, client):
        assert client.post(URL_RENOVAR).status_code == 401

    def test_token_firma_invalida_rechazado(self, client, cuenta_empleado):
        token = login_y_token(client, "empleado@empresa.dev") + "x"

        assert renovar(client, token).status_code == 401

    def test_cuenta_desactivada_no_renueva(self, client, db, cuenta_empleado):
        """La cuenta se revalida en la BD: desactivada = 401 inmediato."""
        token = login_y_token(client, "empleado@empresa.dev")
        cuenta_empleado.activo = False
        db.commit()

        respuesta = renovar(client, token)

        assert respuesta.status_code == 401
        assert "access_token" not in respuesta.json()

    def test_renueva_credencial_temporal(self, client, db):
        """`must_change_password=true` se renueva igual que en /password/change:
        el primer acceso no debe quedarse bloqueado."""
        crear_cuenta(
            db,
            rol="EMPLEADO",
            email="pendiente@empresa.dev",
            empleado=crear_empleado(db, nombre="Empleado Pendiente"),
            must_change_password=True,
        )
        token = login_y_token(client, "pendiente@empresa.dev")

        respuesta = renovar(client, token)

        assert respuesta.status_code == 200, respuesta.text
        assert respuesta.json()["must_change_password"] is True

    def test_el_rol_no_se_toma_de_los_claims_del_token(self, client, cuenta_empleado):
        """La identidad sale de la BD, no del token entrante: un claim `rol`
        manipulado no se perpetúa en el token nuevo."""
        token = crear_access_token(
            cuenta_id=cuenta_empleado.id,
            rol="RH",  # claim alterado a mano; la firma sigue siendo válida
            empleado_id=cuenta_empleado.empleado_id,
        )

        claims = decodificar_access_token(
            renovar(client, token).json()["access_token"]
        )

        assert claims["rol"] == "EMPLEADO"


class TestLoginNoSeRompio:
    """La renovación no altera el contrato existente de login."""

    def test_login_sigue_funcionando(self, client, cuenta_empleado):
        respuesta = client.post(
            URL_LOGIN,
            json={"email": "empleado@empresa.dev", "password": PASSWORD_PRUEBA},
        )

        assert respuesta.status_code == 200, respuesta.text
        assert respuesta.json()["access_token"]

    def test_credenciales_invalidas_siguen_dando_401(self, client):
        respuesta = client.post(
            URL_LOGIN,
            json={"email": "nadie@empresa.dev", "password": "Incorrecta9"},
        )

        assert respuesta.status_code == 401


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
