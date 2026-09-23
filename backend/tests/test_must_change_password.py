"""Tests del flujo must_change_password (Fase 3, requisito 9)."""

from tests.helpers import (
    PASSWORD_PRUEBA,
    URL_CAMBIO,
    URL_LOGIN,
    URL_ME,
    cabecera,
    crear_cuenta,
    crear_empleado,
    login_y_token,
)


def _cuenta_temporal(db):
    """Cuenta de empleado con credencial temporal (PRD §3.3)."""
    empleado = crear_empleado(db)
    return crear_cuenta(
        db,
        rol="EMPLEADO",
        email="nuevo@empresa.dev",
        empleado=empleado,
        must_change_password=True,
    )


class TestCredencialTemporal:
    def test_login_devuelve_flag_temporal(self, client, db):
        _cuenta_temporal(db)
        respuesta = client.post(
            URL_LOGIN, json={"email": "nuevo@empresa.dev", "password": PASSWORD_PRUEBA}
        )
        assert respuesta.status_code == 200
        assert respuesta.json()["must_change_password"] is True

    def test_endpoint_protegido_bloqueado_hasta_cambiar(self, client, db):
        _cuenta_temporal(db)
        token = login_y_token(client, "nuevo@empresa.dev")
        respuesta = client.get(URL_ME, headers=cabecera(token))
        assert respuesta.status_code == 403
        assert "contraseña" in respuesta.json()["detail"].lower()


class TestCambioDePassword:
    def test_flujo_completo(self, client, db):
        """Login con temporal → cambio → flag en false y acceso normal."""
        cuenta = _cuenta_temporal(db)
        token = login_y_token(client, "nuevo@empresa.dev")

        # Con credencial temporal no se exige password_actual (ya se validó
        # en el login).
        respuesta = client.post(
            URL_CAMBIO,
            json={"password_nueva": "Nueva1234"},
            headers=cabecera(token),
        )
        assert respuesta.status_code == 200

        # La contraseña vieja deja de funcionar.
        vieja = client.post(
            URL_LOGIN, json={"email": "nuevo@empresa.dev", "password": PASSWORD_PRUEBA}
        )
        assert vieja.status_code == 401

        # La nueva funciona y ya no queda pendiente el cambio.
        nueva = client.post(
            URL_LOGIN, json={"email": "nuevo@empresa.dev", "password": "Nueva1234"}
        )
        assert nueva.status_code == 200
        assert nueva.json()["must_change_password"] is False

        # El endpoint protegido ya es accesible.
        respuesta_me = client.get(
            URL_ME, headers=cabecera(nueva.json()["access_token"])
        )
        assert respuesta_me.status_code == 200
        assert respuesta_me.json()["must_change_password"] is False
        _ = cuenta  # cuenta temporal usada por el fixture manual

    def test_cambio_exige_password_actual_si_no_es_temporal(
        self, client, cuenta_empleado
    ):
        """Sin must_change_password, se exige la contraseña actual correcta."""
        token = login_y_token(client, "empleado@empresa.dev")

        incorrecta = client.post(
            URL_CAMBIO,
            json={"password_actual": "Incorrecta9", "password_nueva": "Nueva1234"},
            headers=cabecera(token),
        )
        assert incorrecta.status_code == 400

        sin_actual = client.post(
            URL_CAMBIO,
            json={"password_nueva": "Nueva1234"},
            headers=cabecera(token),
        )
        assert sin_actual.status_code == 400

    def test_cambio_correcto_con_password_actual(self, client, cuenta_empleado):
        token = login_y_token(client, "empleado@empresa.dev")
        respuesta = client.post(
            URL_CAMBIO,
            json={"password_actual": PASSWORD_PRUEBA, "password_nueva": "Nueva1234"},
            headers=cabecera(token),
        )
        assert respuesta.status_code == 200

        relogin = client.post(
            URL_LOGIN, json={"email": "empleado@empresa.dev", "password": "Nueva1234"}
        )
        assert relogin.status_code == 200

    def test_cambio_rechaza_password_fuera_de_politica(self, client, cuenta_empleado):
        token = login_y_token(client, "empleado@empresa.dev")
        respuesta = client.post(
            URL_CAMBIO,
            json={"password_actual": PASSWORD_PRUEBA, "password_nueva": "corta"},
            headers=cabecera(token),
        )
        assert respuesta.status_code == 422

    def test_cambio_requiere_autenticacion(self, client):
        respuesta = client.post(
            URL_CAMBIO, json={"password_nueva": "Nueva1234"}
        )
        assert respuesta.status_code == 401
