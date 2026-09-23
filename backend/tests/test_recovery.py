"""Tests de recuperación de acceso (Fase 3, requisito 9).

La respuesta externa debe ser uniforme exista o no la cuenta (PRD §3.4).
Para capturar el token de recuperación en desarrollo local se usa el log
del backend (mecanismo exclusivo de desarrollo, ver DECISIONES_TECNICAS.md).
"""

import hashlib
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models.token_recuperacion import TokenRecuperacion
from app.services.auth_service import MENSAJE_RECUPERACION
from tests.helpers import (
    PASSWORD_PRUEBA,
    URL_LOGIN,
    URL_RECUPERACION,
    URL_RESET,
    crear_cuenta,
    crear_empleado,
)


def _extraer_token_de_log(caplog) -> str:
    """Extrae el token del registro de log de desarrollo local."""
    caplog.set_level(logging.WARNING, logger="app.services.auth_service")
    for registro in caplog.records:
        mensaje = registro.getMessage()
        if "Token de recuperación" in mensaje:
            return mensaje.split(": ")[-1].split(" ")[0]
    raise AssertionError("El token de recuperación no apareció en el log")


class TestSolicitudRecuperacion:
    def test_email_existente_202_y_token_registrado(self, client, db, cuenta_empleado, caplog):
        respuesta = client.post(URL_RECUPERACION, json={"email": "empleado@empresa.dev"})
        assert respuesta.status_code == 202
        assert respuesta.json() == {"mensaje": MENSAJE_RECUPERACION}

        # Internamente quedó un token de un solo uso (hash, no en claro).
        tokens = db.scalars(select(TokenRecuperacion)).all()
        assert len(tokens) == 1
        assert tokens[0].cuenta_id == cuenta_empleado.id
        assert tokens[0].usado is False
        assert len(tokens[0].token_hash) == 64

        # En desarrollo local el token queda registrado en el log.
        token = _extraer_token_de_log(caplog)
        assert hashlib.sha256(token.encode()).hexdigest() == tokens[0].token_hash

    def test_email_inexistente_202_sin_efectos(self, client, db):
        respuesta = client.post(URL_RECUPERACION, json={"email": "nadie@empresa.dev"})
        assert respuesta.status_code == 202
        assert respuesta.json() == {"mensaje": MENSAJE_RECUPERACION}

        assert db.scalars(select(TokenRecuperacion)).all() == []

    def test_respuesta_uniforme_existente_vs_inexistente(self, client, cuenta_empleado):
        existente = client.post(
            URL_RECUPERACION, json={"email": "empleado@empresa.dev"}
        )
        inexistente = client.post(
            URL_RECUPERACION, json={"email": "otro@empresa.dev"}
        )
        assert existente.status_code == inexistente.status_code
        assert existente.json() == inexistente.json()

    def test_cuenta_inactiva_no_genera_token(self, client, db):
        crear_cuenta(db, rol="EMPLEADO", email="inactivo@empresa.dev", activo=False)
        respuesta = client.post(URL_RECUPERACION, json={"email": "inactivo@empresa.dev"})
        assert respuesta.status_code == 202
        assert respuesta.json() == {"mensaje": MENSAJE_RECUPERACION}
        assert db.scalars(select(TokenRecuperacion)).all() == []


class TestResetPassword:
    def _reset(self, client, token: str, password: str = "Nueva1234"):
        return client.post(
            URL_RESET, json={"token": token, "password_nueva": password}
        )

    def test_reset_con_token_valido(self, client, db, cuenta_empleado, caplog):
        client.post(URL_RECUPERACION, json={"email": "empleado@empresa.dev"})
        token = _extraer_token_de_log(caplog)

        respuesta = self._reset(client, token)
        assert respuesta.status_code == 200

        # La contraseña cambió y la nueva funciona.
        assert client.post(
            URL_LOGIN, json={"email": "empleado@empresa.dev", "password": "Nueva1234"}
        ).status_code == 200
        assert client.post(
            URL_LOGIN,
            json={"email": "empleado@empresa.dev", "password": PASSWORD_PRUEBA},
        ).status_code == 401

    def test_token_de_un_solo_uso(self, client, db, cuenta_empleado, caplog):
        client.post(URL_RECUPERACION, json={"email": "empleado@empresa.dev"})
        token = _extraer_token_de_log(caplog)

        assert self._reset(client, token, "Nueva1234").status_code == 200
        reutilizado = self._reset(client, token, "Otra5678")
        assert reutilizado.status_code == 400
        assert reutilizado.json()["detail"] == "Token inválido o expirado."

    def test_token_invalido_rechazado(self, client):
        respuesta = self._reset(client, "token-inventado")
        assert respuesta.status_code == 400

    def test_token_expirado_rechazado(self, client, db, cuenta_empleado):
        token = "token-expirado-de-prueba"
        db.add(
            TokenRecuperacion(
                cuenta_id=cuenta_empleado.id,
                token_hash=hashlib.sha256(token.encode()).hexdigest(),
                expira_en=datetime.now(timezone.utc) - timedelta(minutes=1),
                usado=False,
            )
        )
        db.commit()

        respuesta = self._reset(client, token)
        assert respuesta.status_code == 400
        assert respuesta.json()["detail"] == "Token inválido o expirado."

    def test_reset_no_deja_pendiente_el_cambio(self, client, db, cuenta_empleado, caplog):
        client.post(URL_RECUPERACION, json={"email": "empleado@empresa.dev"})
        token = _extraer_token_de_log(caplog)
        self._reset(client, token)

        login = client.post(
            URL_LOGIN, json={"email": "empleado@empresa.dev", "password": "Nueva1234"}
        )
        assert login.json()["must_change_password"] is False
