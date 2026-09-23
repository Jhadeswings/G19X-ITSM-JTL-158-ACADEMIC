"""Endpoints de autenticación (Fase 3).

Solo los endpoints reales de esta fase (Especificación Técnica §31):
- POST /auth/login
- POST /auth/password/change
- POST /auth/recovery/request
- POST /auth/recovery/reset
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_allow_pending
from app.core.db import get_db
from app.models.cuenta_acceso import CuentaAcceso
from app.schemas.auth import (
    LoginIn,
    PasswordChangeIn,
    RecoveryRequestIn,
    RecoveryResetIn,
    TokenOut,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
def login(datos: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    """Login con email + contraseña.

    Respuesta uniforme 401 para email inexistente, contraseña incorrecta o
    cuenta inactiva (sin enumeración de cuentas).
    """
    cuenta, token = auth_service.login(db, datos.email, datos.password)
    return TokenOut(
        access_token=token,
        rol=cuenta.rol,
        must_change_password=cuenta.must_change_password,
    )


@router.post(
    "/password/change",
    status_code=status.HTTP_200_OK,
)
def cambiar_password(
    datos: PasswordChangeIn,
    cuenta: CuentaAcceso = Depends(get_current_user_allow_pending),
    db: Session = Depends(get_db),
) -> dict:
    """Cambia la contraseña de la cuenta autenticada.

    Disponible también con ``must_change_password=true`` (credencial
    temporal): es el único endpoint permitido en ese estado.
    El endpoint no acepta ningún identificador de cuenta: la identidad
    proviene exclusivamente del token (base anti-IDOR, §32).
    """
    auth_service.cambiar_password(
        db,
        cuenta,
        datos.password_actual,
        datos.password_nueva,
    )
    return {"mensaje": "Contraseña actualizada."}


@router.post(
    "/recovery/request",
    status_code=status.HTTP_202_ACCEPTED,
)
def solicitar_recuperacion(
    datos: RecoveryRequestIn, db: Session = Depends(get_db)
) -> dict:
    """Solicita la recuperación de acceso.

    La respuesta es SIEMPRE idéntica, exista o no la cuenta (PRD §3.4).
    """
    auth_service.solicitar_recuperacion(db, datos.email)
    return {"mensaje": auth_service.MENSAJE_RECUPERACION}


@router.post("/recovery/reset")
def restablecer_password(
    datos: RecoveryResetIn, db: Session = Depends(get_db)
) -> dict:
    """Establece una nueva contraseña con un token de recuperación.

    Token de un solo uso y con expiración; solo afecta a la cuenta para la
    que fue emitido.
    """
    auth_service.restablecer_password(db, datos.token, datos.password_nueva)
    return {"mensaje": "Contraseña restablecida."}
