"""Tests de recuperación de acceso (Fase 3, requisito 9).

La respuesta externa debe ser uniforme exista o no la cuenta (PRD §3.4).
El token se entrega EXCLUSIVAMENTE por correo (DECISIONES §53): la suite
lo captura del proveedor simulado (`correo_simulado`), nunca de los logs.
"""

import hashlib
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models.token_recuperacion import TokenRecuperacion
from app.services import correo_service
from app.services.auth_service import MENSAJE_RECUPERACION
from tests.helpers import (
    PASSWORD_PRUEBA,
    URL_LOGIN,
    URL_RECUPERACION,
    URL_RESET,
    correos_a,
    crear_cuenta,
    crear_empleado,
    secreto_de_correo,
)


def _extraer_token_de_correo(correo_simulado) -> str:
    """Extrae el token del correo capturado por el proveedor simulado."""
    return secreto_de_correo(correo_simulado, "Token de restablecimiento")


class TestSolicitudRecuperacion:
    def test_email_existente_202_y_token_registrado(
        self, client, db, cuenta_empleado, correo_simulado, caplog
    ):
        respuesta = client.post(URL_RECUPERACION, json={"email": "empleado@empresa.dev"})
        assert respuesta.status_code == 202
        assert respuesta.json() == {"mensaje": MENSAJE_RECUPERACION}

        # Internamente quedó un token de un solo uso (hash, no en claro).
        tokens = db.scalars(select(TokenRecuperacion)).all()
        assert len(tokens) == 1
        assert tokens[0].cuenta_id == cuenta_empleado.id
        assert tokens[0].usado is False
        assert len(tokens[0].token_hash) == 64

        # El token viaja SOLO en el correo, dirigido a la cuenta correcta.
        assert len(correos_a(correo_simulado, "empleado@empresa.dev")) == 1
        token = _extraer_token_de_correo(correo_simulado)
        assert hashlib.sha256(token.encode()).hexdigest() == tokens[0].token_hash

        # Y NO aparece en los logs (auditoría de secretos, §53).
        assert "Token de recuperación" not in caplog.text
        assert token not in caplog.text

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

    def test_reset_con_token_valido(self, client, db, cuenta_empleado, correo_simulado):
        client.post(URL_RECUPERACION, json={"email": "empleado@empresa.dev"})
        token = _extraer_token_de_correo(correo_simulado)

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

    def test_token_de_un_solo_uso(self, client, db, cuenta_empleado, correo_simulado):
        client.post(URL_RECUPERACION, json={"email": "empleado@empresa.dev"})
        token = _extraer_token_de_correo(correo_simulado)

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

    def test_reset_no_deja_pendiente_el_cambio(self, client, db, cuenta_empleado, correo_simulado):
        client.post(URL_RECUPERACION, json={"email": "empleado@empresa.dev"})
        token = _extraer_token_de_correo(correo_simulado)
        self._reset(client, token)

        login = client.post(
            URL_LOGIN, json={"email": "empleado@empresa.dev", "password": "Nueva1234"}
        )
        assert login.json()["must_change_password"] is False


class TestEntregaPorCorreo:
    """El correo es el ÚNICO canal de entrega del token (DECISIONES §53).

    Un fallo del proveedor NO inutiliza la recuperación ni rompe la
    respuesta uniforme: el token queda vigente y la solicitud puede
    repetirse cuando el proveedor se recupere.
    """

    def test_proveedor_falla_respuesta_uniforme_token_vigente_y_reintento(
        self, client, db, cuenta_empleado, correo_simulado, monkeypatch, caplog
    ):
        fallo = {"activo": True}

        def _transporte_condicional(mensaje, _conf=None):
            if fallo["activo"]:
                raise correo_service.ErrorEnvioCorreo("proveedor caído")
            correo_simulado.aceptados.append(mensaje)

        monkeypatch.setattr(correo_service, "_enviar_smtp", _transporte_condicional)
        caplog.set_level(logging.ERROR, logger="app.services.auth_service")

        # Con el proveedor caído: 202 uniforme, token persistente, sin
        # envíos y con la causa (no el token) en el log interno.
        primera = client.post(
            URL_RECUPERACION, json={"email": "empleado@empresa.dev"}
        )
        assert primera.status_code == 202
        assert primera.json() == {"mensaje": MENSAJE_RECUPERACION}
        tokens = db.scalars(select(TokenRecuperacion)).all()
        assert len(tokens) == 1
        assert tokens[0].usado is False
        assert correo_simulado.aceptados == []
        assert "Token de recuperación" not in caplog.text

        # El proveedor se recupera: reintentar entrega el token y el flujo
        # completo (reset + login con la nueva contraseña) sigue funcionando.
        fallo["activo"] = False
        segunda = client.post(
            URL_RECUPERACION, json={"email": "empleado@empresa.dev"}
        )
        assert segunda.status_code == 202
        assert segunda.json() == {"mensaje": MENSAJE_RECUPERACION}
        token = _extraer_token_de_correo(correo_simulado)

        assert client.post(
            URL_RESET, json={"token": token, "password_nueva": "Nueva1234"}
        ).status_code == 200
        assert client.post(
            URL_LOGIN,
            json={"email": "empleado@empresa.dev", "password": "Nueva1234"},
        ).status_code == 200

    def test_proveedor_no_configurado_respuesta_uniforme(
        self, client, db, cuenta_empleado, correo_simulado, monkeypatch
    ):
        def _sin_configurar(_mensaje, _conf=None):
            raise correo_service.ErrorCorreoNoConfigurado("sin SMTP")

        monkeypatch.setattr(correo_service, "_enviar_smtp", _sin_configurar)

        respuesta = client.post(
            URL_RECUPERACION, json={"email": "empleado@empresa.dev"}
        )

        # Misma respuesta que con proveedor operativo: nada revela el
        # estado interno ni la existencia de la cuenta (PRD §3.4).
        assert respuesta.status_code == 202
        assert respuesta.json() == {"mensaje": MENSAJE_RECUPERACION}
        assert len(db.scalars(select(TokenRecuperacion)).all()) == 1
        assert correo_simulado.aceptados == []

    def test_email_inexistente_no_envia_nada(
        self, client, cuenta_empleado, correo_simulado
    ):
        client.post(URL_RECUPERACION, json={"email": "nadie@empresa.dev"})

        # Sin cuenta activa no hay correo: tampoco el proveedor puede
        # delatar qué direcciones existen.
        assert correo_simulado.aceptados == []
