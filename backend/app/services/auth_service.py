"""Servicio de autenticación (Fase 3).

Responsabilidades:
- login con email normalizado (§4.1) y respuesta uniforme ante credenciales
  inválidas o cuentas inactivas (sin enumeración);
- cambio de contraseña con política del PRD §3.5 y bajada de
  ``must_change_password``;
- recuperación de acceso con tokens de un solo uso, expiración y respuesta
  externa uniforme (§4.2: la recuperación no debe revelar si una cuenta
  existe).
"""

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import (
    crear_access_token,
    hash_password,
    verificar_password,
    verificar_password_dummy,
)
from app.models.cuenta_acceso import CuentaAcceso
from app.models.token_recuperacion import TokenRecuperacion

logger = logging.getLogger(__name__)

# Mensaje externo SIEMPRE idéntico, exista o no la cuenta (PRD §3.4).
MENSAJE_RECUPERACION = (
    "Si el correo corresponde a una cuenta activa, recibirás instrucciones "
    "para restablecer tu acceso."
)

MENSAJE_CREDENCIALES = "Credenciales inválidas."


def normalizar_email(email: str) -> str:
    """Normalización para comparación (Especificación Técnica §4.1)."""
    return email.strip().lower()


def _buscar_cuenta_activa(db: Session, email: str) -> CuentaAcceso | None:
    return db.scalar(
        select(CuentaAcceso).where(
            func.lower(func.trim(CuentaAcceso.email)) == normalizar_email(email),
            CuentaAcceso.activo.is_(True),
        )
    )


def autenticar(db: Session, email: str, password: str) -> CuentaAcceso | None:
    """Autentica por email + contraseña.

    Devuelve la cuenta solo si las credenciales son válidas Y la cuenta está
    activa. Cualquier otro caso devuelve ``None`` con el mismo mensaje
    externo: no se distingue email inexistente, contraseña incorrecta ni
    cuenta inactiva (anti-enumeración, §4.2).
    """
    cuenta = db.scalar(
        select(CuentaAcceso).where(
            func.lower(func.trim(CuentaAcceso.email)) == normalizar_email(email)
        )
    )
    if cuenta is None:
        # Igualar el tiempo de respuesta del caso "email inexistente"
        # respecto al caso "contraseña incorrecta" (anti timing-attack).
        verificar_password_dummy(password)
        return None
    if not verificar_password(password, cuenta.password_hash):
        return None
    if not cuenta.activo:
        return None
    return cuenta


def login(db: Session, email: str, password: str) -> tuple[CuentaAcceso, str]:
    """Login completo: devuelve la cuenta y su JWT de acceso."""
    cuenta = autenticar(db, email, password)
    if cuenta is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=MENSAJE_CREDENCIALES,
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = crear_access_token(
        cuenta_id=cuenta.id, rol=cuenta.rol, empleado_id=cuenta.empleado_id
    )
    return cuenta, token


def renovar_access_token(cuenta: CuentaAcceso) -> str:
    """Emite un JWT de acceso NUEVO para una cuenta YA autenticada.

    Renovación stateless: no guarda nada en la base de datos, no registra
    sesiones y NO introduce un refresh token (siguen sin existir, tal como fija
    ``DECISIONES_TECNICAS.md`` §1). Solo prolonga la vida del token de acceso.

    La cuenta que se usa es SIEMPRE la que ``app.api.deps`` ya cargó y validó
    desde la base de datos, nunca los claims del token entrante: así un token
    con ``rol`` o ``empleado_id`` obsoletos no se perpetúa, y una cuenta
    desactivada ya habría sido rechazada con 401 antes de llegar aquí.

    NO puede revivir una sesión caducada: si el token presentado expiró, la
    validación de ``decodificar_access_token`` falla antes y el endpoint nunca
    llega a emitirse. El frontend es responsable de no llamar a este endpoint
    en bucle (debe aplicar su propia cadence/throttle).
    """
    return crear_access_token(
        cuenta_id=cuenta.id, rol=cuenta.rol, empleado_id=cuenta.empleado_id
    )


def cambiar_password(
    db: Session,
    cuenta: CuentaAcceso,
    password_actual: str | None,
    password_nueva: str,
) -> CuentaAcceso:
    """Cambia la contraseña de la propia cuenta.

    - Si ``must_change_password=true`` (credencial temporal, PRD §3.3) no se
      exige ``password_actual``: la identidad ya se estableció en el login.
    - Si ``must_change_password=false`` se exige ``password_actual`` correcta.
    - La política de la nueva contraseña se valida en el esquema Pydantic.
    - Al cambiar con éxito, ``must_change_password`` pasa a ``false``.
    """
    if not cuenta.must_change_password:
        if (
            password_actual is None
            or not verificar_password(password_actual, cuenta.password_hash)
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La contraseña actual es incorrecta.",
            )
    cuenta.password_hash = hash_password(password_nueva)
    cuenta.must_change_password = False
    db.commit()
    db.refresh(cuenta)
    return cuenta

# ---------------------------------------------------------------------------
# Recuperación de acceso
# ---------------------------------------------------------------------------


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _entregar_token_recuperacion(email: str, token: str) -> None:
    """Entrega del token de recuperación.

    SOLO DESARROLLO LOCAL: la documentación no define proveedor de correo,
    por lo que en local el token se escribe en el log del backend (controlado
    por ``RECOVERY_TOKEN_DEV_LOG``). Esto NO es un mecanismo de envío para
    producción: cuando exista un proveedor real (SMTP u otro), se sustituye
    exclusivamente esta función, sin tocar el resto del flujo
    (ver backend/DECISIONES_TECNICAS.md).
    """
    settings = get_settings()
    if settings.RECOVERY_TOKEN_DEV_LOG:
        logger.warning(
            "[SOLO DESARROLLO LOCAL] Token de recuperación para %s: %s "
            "(no usar este mecanismo en producción)",
            email,
            token,
        )
    else:
        logger.info(
            "Solicitud de recuperación registrada para %s "
            "(envío de correo aún no configurado).",
            email,
        )


def solicitar_recuperacion(db: Session, email: str) -> None:
    """Registra un token de recuperación si el email corresponde a una cuenta activa.

    Respuesta externa SIEMPRE uniforme (PRD §3.4): esta función no revela
    nada; si la cuenta no existe o está inactiva, no se escribe nada en la
    base de datos y el endpoint responde exactamente lo mismo.
    """
    cuenta = _buscar_cuenta_activa(db, email)
    if cuenta is None:
        return

    settings = get_settings()
    token = secrets.token_urlsafe(48)
    db.add(
        TokenRecuperacion(
            cuenta_id=cuenta.id,
            token_hash=_hash_token(token),
            expira_en=datetime.now(timezone.utc)
            + timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES),
            usado=False,
        )
    )
    db.commit()
    _entregar_token_recuperacion(cuenta.email, token)


def restablecer_password(db: Session, token: str, password_nueva: str) -> None:
    """Restablece la contraseña usando un token de recuperación.

    Un token válido solo restablece la cuenta para la que fue emitido, una
    sola vez y antes de expirar. Cualquier fallo produce el mismo mensaje
    genérico (sin revelar la causa exacta).
    """
    ahora = datetime.now(timezone.utc)
    registro = db.scalar(
        select(TokenRecuperacion).where(
            TokenRecuperacion.token_hash == _hash_token(token),
            TokenRecuperacion.usado.is_(False),
        )
    )
    if (
        registro is None
        or registro.expira_en < ahora
        or not registro.cuenta.activo
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token inválido o expirado.",
        )

    registro.cuenta.password_hash = hash_password(password_nueva)
    registro.cuenta.must_change_password = False
    registro.usado = True
    # Limpieza de tokens ya expirados (los usados se conservan para impedir
    # reutilización incluso si ``usado`` se manipulara).
    db.execute(delete(TokenRecuperacion).where(TokenRecuperacion.expira_en < ahora))
    db.commit()
