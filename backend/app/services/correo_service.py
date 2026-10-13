"""Envío de correo del sistema (PRD §3.3 alta; §3.4 recuperación).

Transporte SMTP configurable EXCLUSIVAMENTE por variables de entorno
(``SMTP_*`` de ``app.core.config``): sin proveedor hardcodeado y sin
credenciales en el código. Usa la biblioteca estándar (``smtplib`` +
``email.message``), de modo que la integración NO añade dependencias.

Reglas de seguridad (auditoría de secretos, DECISIONES_TECNICAS §53):

- Contraseñas temporales, tokens de recuperación y cuerpos de correo
  JAMÁS se escriben en logs ni viajan en mensajes de error: el log
  registra como máximo asunto y destinatario.
- ``enviar_correo`` nunca declara un envío que no ocurrió: si el
  proveedor no está configurado o no acepta el mensaje se lanza
  ``ErrorCorreo`` y QUIEN LLAMA decide (alta → 503 + rollback;
  recuperación → log controlado con 202 uniforme intacto).
- Los cuerpos son plantillas propias con el contenido estrictamente
  necesario: nada de datos de negocio, niveles ni resultados.
"""

import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


class ErrorCorreo(Exception):
    """Fallo del envío de correo: base común, sin detalles sensibles."""


class ErrorCorreoNoConfigurado(ErrorCorreo):
    """El proveedor SMTP no está configurado (SMTP_HOST/SMTP_FROM vacíos)."""


class ErrorEnvioCorreo(ErrorCorreo):
    """El proveedor rechazó el mensaje o falló la conexión/envío."""


@dataclass(frozen=True)
class CorreoSaliente:
    """Correo listo para enviar: destinatario, asunto y texto plano."""

    destinatario: str
    asunto: str
    texto: str


# ---------------------------------------------------------------------------
# Plantillas (contenido estrictamente necesario, sin datos de negocio)
# ---------------------------------------------------------------------------

ASUNTO_CREDENCIAL = "Credencial de acceso — Sistema de Talento"
ASUNTO_RECUPERACION = "Restablecimiento de acceso — Sistema de Talento"


def construir_correo_credencial_temporal(
    nombre: str, email: str, credencial: str
) -> CorreoSaliente:
    """Correo con la credencial temporal del alta (PRD §3.3).

    La política §3.5 se recuerda en una línea: es lo que el empleado
    necesita para completar el primer acceso. Nada más.
    """
    texto = (
        f"Hola {nombre}:\n"
        "\n"
        "Se registró tu cuenta de acceso al Sistema de Talento con este\n"
        f"correo ({email}).\n"
        "\n"
        f"Credencial temporal: {credencial}\n"
        "\n"
        "Al iniciar sesión por primera vez el sistema te pedirá cambiarla\n"
        "por una contraseña propia (mínimo 8 caracteres y al menos un\n"
        "número).\n"
        "\n"
        "Si no esperabas este mensaje, puedes ignorarlo.\n"
    )
    return CorreoSaliente(
        destinatario=email, asunto=ASUNTO_CREDENCIAL, texto=texto
    )


def construir_correo_recuperacion(
    email: str, token: str, minutos_de_validez: int
) -> CorreoSaliente:
    """Correo con el token de restablecimiento (PRD §3.4; DECISIONES §4/§53).

    El mecanismo vigente del flujo es el token de un solo uso consumido en
    ``POST /auth/recovery/reset``: el correo entrega ese token tal cual con
    su caducidad y NO incluye enlaces (el MVP no define URL pública ni
    pantalla que lo consuma; inventarlas sería una decisión de producto).
    """
    texto = (
        "Recibimos una solicitud para restablecer el acceso de la cuenta\n"
        f"{email}.\n"
        "\n"
        f"Token de restablecimiento: {token}\n"
        "\n"
        f"Caduca en {minutos_de_validez} minutos y puede usarse una sola\n"
        "vez. Si no solicitaste el restablecimiento, ignora este mensaje:\n"
        "tu contraseña no cambia hasta que el token se use.\n"
    )
    return CorreoSaliente(
        destinatario=email, asunto=ASUNTO_RECUPERACION, texto=texto
    )


# ---------------------------------------------------------------------------
# Envío
# ---------------------------------------------------------------------------


def enviar_correo(correo: CorreoSaliente) -> None:
    """Envía ``correo`` por el proveedor configurado.

    Lanza ``ErrorCorreoNoConfigurado`` o ``ErrorEnvioCorreo`` si el envío
    no se confirmó: NO existe el éxito silencioso y el cuerpo nunca se
    registra en el log.
    """
    conf = get_settings()
    mensaje = EmailMessage()
    mensaje["From"] = conf.SMTP_FROM
    mensaje["To"] = correo.destinatario
    mensaje["Subject"] = correo.asunto
    mensaje.set_content(correo.texto)
    _enviar_smtp(mensaje, conf)
    logger.info(
        "Correo aceptado por el proveedor: '%s' → %s",
        correo.asunto,
        correo.destinatario,
    )


def _enviar_smtp(mensaje: EmailMessage, conf: Settings | None = None) -> None:
    """Transporte SMTP real. Sustituido por un simulado en los tests.

    El parámetro ``conf`` permite inyectar configuración en las pruebas de
    unidad sin tocar el ``lru_cache`` de ``get_settings``. STARTTLS y las
    credenciales son opcionales y salen SIEMPRE del entorno, nunca del
    código. Ningún dato del mensaje entra en las excepciones.
    """
    conf = conf or get_settings()
    if not conf.SMTP_HOST or not conf.SMTP_FROM:
        raise ErrorCorreoNoConfigurado(
            "Falta configurar el proveedor de correo: SMTP_HOST y SMTP_FROM "
            "son obligatorios para enviar (ver backend/.env.example)."
        )
    try:
        with smtplib.SMTP(
            conf.SMTP_HOST, conf.SMTP_PORT, timeout=conf.SMTP_TIMEOUT_SEGUNDOS
        ) as conexion:
            if conf.SMTP_STARTTLS:
                conexion.starttls(context=ssl.create_default_context())
            if conf.SMTP_USER and conf.SMTP_PASSWORD:
                conexion.login(conf.SMTP_USER, conf.SMTP_PASSWORD)
            conexion.send_message(mensaje)
    except (smtplib.SMTPException, OSError) as error:
        raise ErrorEnvioCorreo(
            "El proveedor de correo no aceptó el mensaje."
        ) from error
