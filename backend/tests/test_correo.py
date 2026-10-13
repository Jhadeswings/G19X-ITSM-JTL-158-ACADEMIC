"""Tests del servicio de correo (PRD §3.3/§3.4; DECISIONES_TECNICAS §53).

Pruebas de UNIDAD sin base de datos (marcadas ``no_db``): plantillas,
transporte SMTP (con ``smtplib`` simulado) y la garantía de que ningún
secreto viaja a los logs. Los flujos HTTP completos viven en
``test_empleados_rh.py`` (alta) y ``test_recovery.py`` (recuperación),
todos contra el proveedor simulado de ``conftest``.
"""

import logging
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
import smtplib

from app.services import correo_service

pytestmark = pytest.mark.no_db


def _conf(**sobrescrituras):
    """Configuración de prueba inyectable (no toca get_settings)."""
    base = dict(
        SMTP_HOST="smtp.pruebas.local",
        SMTP_PORT=587,
        SMTP_USER="usuario",
        SMTP_PASSWORD="secreto-smtp",
        SMTP_FROM="no-reply@empresa.dev",
        SMTP_STARTTLS=True,
        SMTP_TIMEOUT_SEGUNDOS=1.0,
    )
    base.update(sobrescrituras)
    return SimpleNamespace(**base)


class TestPlantillas:
    def test_correo_credencial_temporal(self):
        correo = correo_service.construir_correo_credencial_temporal(
            "Empleado Nuevo", "nuevo@empresa.dev", "Temporal123456-abc"
        )
        assert correo.destinatario == "nuevo@empresa.dev"
        assert correo.asunto == correo_service.ASUNTO_CREDENCIAL
        assert "Credencial temporal: Temporal123456-abc" in correo.texto
        # Recuerda la obligación del primer acceso (PRD §3.3/§3.5).
        assert "cambiarla" in correo.texto
        assert "8 caracteres" in correo.texto

    def test_correo_recuperacion_entrega_el_token_con_caducidad(self):
        correo = correo_service.construir_correo_recuperacion(
            "empleado@empresa.dev", "token-abc-123", 30
        )
        assert correo.destinatario == "empleado@empresa.dev"
        assert correo.asunto == correo_service.ASUNTO_RECUPERACION
        assert "Token de restablecimiento: token-abc-123" in correo.texto
        assert "Caduca en 30 minutos" in correo.texto
        assert "una sola" in correo.texto
        # El MVP no define URL pública: el correo NO incluye enlaces.
        assert "http" not in correo.texto


class TestTransporteSmtp:
    """Ejecuta la implementación REAL del transporte (``transporte.real``)
    con ``smtplib`` simulado: el fixture global parchea el atributo del
    módulo, así que se invoca la referencia conservada."""

    def _mensaje(self):
        correo = correo_service.construir_correo_recuperacion(
            "empleado@empresa.dev", "token-abc", 30
        )
        return correo, correo.texto

    def test_sin_configurar_lanza_error_propio(
        self, correo_simulado, monkeypatch
    ):
        monkeypatch.setattr(smtplib, "SMTP", MagicMock())
        correo, _ = self._mensaje()

        with pytest.raises(correo_service.ErrorCorreoNoConfigurado):
            correo_simulado.real(correo, _conf(SMTP_HOST=""))
        with pytest.raises(correo_service.ErrorCorreoNoConfigurado):
            correo_simulado.real(correo, _conf(SMTP_FROM=""))

    def test_fallo_de_proveedor_lanza_error_envio_sin_filtrar_cuerpo(
        self, correo_simulado, monkeypatch
    ):
        monkeypatch.setattr(
            smtplib,
            "SMTP",
            MagicMock(side_effect=ConnectionRefusedError("sin ruta")),
        )
        correo, texto = self._mensaje()

        with pytest.raises(correo_service.ErrorEnvioCorreo) as excinfo:
            correo_simulado.real(correo, _conf())

        # El mensaje de error NO contiene el cuerpo ni el token.
        assert "token-abc" not in str(excinfo.value)
        assert texto not in str(excinfo.value)

    def test_exito_con_starttls_y_login(self, correo_simulado, monkeypatch):
        fabrica = MagicMock()
        monkeypatch.setattr(smtplib, "SMTP", fabrica)
        correo, _ = self._mensaje()

        correo_simulado.real(correo, _conf())

        fabrica.assert_called_once_with(
            "smtp.pruebas.local", 587, timeout=1.0
        )
        conexion = fabrica.return_value.__enter__.return_value
        conexion.starttls.assert_called_once()
        conexion.login.assert_called_once_with("usuario", "secreto-smtp")
        conexion.send_message.assert_called_once()

    def test_exito_sin_starttls_ni_credenciales(
        self, correo_simulado, monkeypatch
    ):
        fabrica = MagicMock()
        monkeypatch.setattr(smtplib, "SMTP", fabrica)
        correo, _ = self._mensaje()

        correo_simulado.real(
            correo,
            _conf(SMTP_STARTTLS=False, SMTP_USER="", SMTP_PASSWORD=""),
        )

        conexion = fabrica.return_value.__enter__.return_value
        conexion.starttls.assert_not_called()
        conexion.login.assert_not_called()
        conexion.send_message.assert_called_once()


class TestEnviarCorreo:
    def test_construye_el_mensaje_y_registra_solo_los_metadatos(
        self, correo_simulado, caplog
    ):
        correo = correo_service.construir_correo_credencial_temporal(
            "Empleado Nuevo", "nuevo@empresa.dev", "Temporal123456-abc"
        )

        with caplog.at_level(logging.INFO, logger="app.services.correo_service"):
            correo_service.enviar_correo(correo)

        assert len(correo_simulado.aceptados) == 1
        mensaje = correo_simulado.aceptados[0]
        assert mensaje["To"] == "nuevo@empresa.dev"
        assert mensaje["Subject"] == correo_service.ASUNTO_CREDENCIAL
        assert "Temporal123456-abc" in mensaje.get_content()

        # El log registra el envío SIN el cuerpo ni la credencial (el
        # asunto no es secreto y sí se registra para operación).
        assert "Temporal123456-abc" not in caplog.text
        assert "Hola Empleado Nuevo" not in caplog.text
        assert "nuevo@empresa.dev" in caplog.text