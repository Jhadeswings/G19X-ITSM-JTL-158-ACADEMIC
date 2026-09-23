"""Dependencias de autenticación y autorización (Fase 3).

Especificación Técnica v1.5 §31: todas las decisiones de acceso se validan
en el backend, separando:

- authentication  → ``get_current_user`` / ``get_current_user_allow_pending``
- authorization   → ``require_rh`` / ``require_empleado``
- ownership       → ``empleado_id_propio`` / ``verificar_pertenencia`` (§32)

La autorización NUNCA depende de controles del frontend.
"""

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decodificar_access_token
from app.models.cuenta_acceso import CuentaAcceso

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login", auto_error=False
)

MENSAJE_CREDENCIALES = "Credenciales inválidas."


def _excepcion_credenciales() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=MENSAJE_CREDENCIALES,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _cuenta_desde_token(token: str | None, db: Session) -> CuentaAcceso:
    """Resuelve el JWT de acceso en la cuenta vigente.

    La cuenta se recarga desde la base de datos en cada request: un token
    emitido para una cuenta posteriormente desactivada deja de servir de
    inmediato (no se confía en claims obsoletos de rol/activo).
    """
    if not token:
        raise _excepcion_credenciales()
    try:
        payload = decodificar_access_token(token)
        cuenta_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        raise _excepcion_credenciales() from None

    cuenta = db.get(CuentaAcceso, cuenta_id)
    if cuenta is None or not cuenta.activo:
        raise _excepcion_credenciales()
    return cuenta


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> CuentaAcceso:
    """Usuario autenticado con contraseña definitiva.

    Si la cuenta tiene ``must_change_password=true`` (credencial temporal,
    PRD §3.3) se bloquea el acceso al resto de endpoints hasta que cambie
    su contraseña: solo ``POST /auth/password/change`` queda disponible
    (vía ``get_current_user_allow_pending``).
    """
    cuenta = _cuenta_desde_token(token, db)
    if cuenta.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Debe cambiar su contraseña antes de continuar.",
        )
    return cuenta


def get_current_user_allow_pending(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> CuentaAcceso:
    """Como ``get_current_user`` pero permite cuentas con credencial temporal.

    Uso exclusivo previsto: ``POST /auth/password/change``.
    """
    return _cuenta_desde_token(token, db)


# ---------------------------------------------------------------------------
# Autorización por rol (RBAC, backend)
# ---------------------------------------------------------------------------


def require_rh(
    cuenta: CuentaAcceso = Depends(get_current_user),
) -> CuentaAcceso:
    """Exige rol RH. Debe proteger los endpoints ``/rh/*`` de fases futuras."""
    if cuenta.rol != "RH":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso exclusivo para el rol RH.",
        )
    return cuenta


def require_empleado(
    cuenta: CuentaAcceso = Depends(get_current_user),
) -> CuentaAcceso:
    """Exige rol EMPLEADO con ``empleado_id`` asociado.

    Debe proteger los endpoints ``/me/*`` de negocio de fases futuras.
    """
    if cuenta.rol != "EMPLEADO" or cuenta.empleado_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso exclusivo para el rol Empleado.",
        )
    return cuenta


# ---------------------------------------------------------------------------
# Base de ownership (protección IDOR, Especificación Técnica §32)
# ---------------------------------------------------------------------------


def empleado_id_propio(cuenta: CuentaAcceso) -> int:
    """Devuelve el ``empleado_id`` SIEMPRE desde la cuenta autenticada.

    Nunca confiar en un ``empleado_id`` enviado por el cliente (§32). Las
    fases futuras (participaciones, capacitaciones, evaluaciones) deben
    derivar el empleado desde aquí o desde ``require_empleado``.
    """
    if cuenta.empleado_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta autenticada no está asociada a un empleado.",
        )
    return cuenta.empleado_id


def verificar_pertenencia(cuenta: CuentaAcceso, empleado_id_recurso: int) -> None:
    """Verifica que un recurso pertenece al empleado autenticado (§32).

    Responde 404 (y no 403) cuando el recurso no pertenece al usuario, para
    no revelar la existencia de recursos ajenos. Es la base reutilizable
    anti-IDOR; NO define reglas de módulos que aún no existen.
    """
    if cuenta.empleado_id != empleado_id_recurso:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recurso no encontrado.",
        )
