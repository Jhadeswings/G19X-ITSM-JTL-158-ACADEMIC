"""Primitivas de seguridad (Fase 3).

- Hash y verificación de contraseñas con bcrypt (Especificación Técnica
  v1.5 §4.2: nunca almacenar contraseñas en texto plano).
- Política de contraseña del PRD §3.5: mínimo 8 caracteres y al menos
  un número.
- Emisión y validación de JWT de acceso (HS256). La elección del
  mecanismo de sesión/token está documentada en
  ``backend/DECISIONES_TECNICAS.md``.
"""

import bcrypt
import jwt
from datetime import datetime, timedelta, timezone

from app.core.config import get_settings

# Longitud mínima de contraseña (PRD §3.5).
MIN_PASSWORD_LEN = 8

# Hash fijo usado SOLO para igualar el tiempo de respuesta cuando el email
# no existe, mitigando la enumeración de cuentas por timing.
_DUMMY_HASH = bcrypt.hashpw(
    b"timing-equalization-dummy-password", bcrypt.gensalt(rounds=12)
).decode("utf-8")


def validar_politica_password(password: str) -> list[str]:
    """Valida la política del PRD §3.5.

    Devuelve la lista de errores (vacía si la contraseña es válida):
    mínimo 8 caracteres y al menos un número.
    """
    errores: list[str] = []
    if len(password) < MIN_PASSWORD_LEN:
        errores.append(
            f"La contraseña debe tener al menos {MIN_PASSWORD_LEN} caracteres."
        )
    if not any(caracter.isdigit() for caracter in password):
        errores.append("La contraseña debe incluir al menos un número.")
    return errores


def hash_password(password: str) -> str:
    """Hashea una contraseña con bcrypt. Nunca almacenar en texto plano."""
    rondas = get_settings().BCRYPT_LOG_ROUNDS
    return bcrypt.hashpw(
        password.encode("utf-8"), bcrypt.gensalt(rounds=rondas)
    ).decode("utf-8")


def verificar_password(password: str, password_hash: str) -> bool:
    """Verifica una contraseña en claro contra su hash bcrypt."""
    try:
        return bcrypt.checkpw(
            password.encode("utf-8"), password_hash.encode("utf-8")
        )
    except ValueError:
        # Hash malformado: tratar como verificación fallida, nunca reventar.
        return False


def verificar_password_dummy(password: str) -> None:
    """Consume un hash falso para igualar tiempos (anti-enumeración)."""
    bcrypt.checkpw(password.encode("utf-8"), _DUMMY_HASH.encode("utf-8"))


def crear_access_token(
    *,
    cuenta_id: int,
    rol: str,
    empleado_id: int | None,
    expires_delta: timedelta | None = None,
) -> str:
    """Emite un JWT de acceso firmado (HS256).

    El ``sub`` es SIEMPRE el ``cuenta_id`` emitido por el backend; nunca
    datos provistos por el cliente. Los claims ``rol``/``empleado_id`` son
    informativos: en cada request la cuenta se revalida contra la base de
    datos (ver ``app.api.deps``).
    """
    settings = get_settings()
    ahora = datetime.now(timezone.utc)
    expiracion = expires_delta or timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": str(cuenta_id),
        "rol": rol,
        "empleado_id": empleado_id,
        "iat": ahora,
        "exp": ahora + expiracion,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def decodificar_access_token(token: str) -> dict:
    """Decodifica y valida firma/expiración de un JWT.

    Lanza ``jwt.PyJWTError`` (o subclase) si el token es inválido o
    expiró; la traducción a ``HTTPException`` vive en ``app.api.deps``.
    """
    return jwt.decode(
        token, get_settings().SECRET_KEY, algorithms=["HS256"]
    )
