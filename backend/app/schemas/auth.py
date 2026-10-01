"""Esquemas Pydantic de autenticación (Fase 3)."""

from pydantic import BaseModel, EmailStr, field_validator

from app.core.security import validar_politica_password


def _normalizar_email(valor: object) -> object:
    """Normalización para comparación (§4.1): trim antes de validar."""
    if isinstance(valor, str):
        return valor.strip()
    return valor


def _validar_politica(valor: str) -> str:
    """Validador común: política del PRD §3.5 (mín. 8 caracteres, 1 número)."""
    errores = validar_politica_password(valor)
    if errores:
        raise ValueError(" ".join(errores))
    return valor


class LoginIn(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email", mode="before")
    @classmethod
    def _strip_email(cls, valor: object) -> object:
        return _normalizar_email(valor)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    rol: str
    must_change_password: bool


class MeOut(BaseModel):
    """Identidad del usuario autenticado (GET /api/v1/me).

    ``puesto`` y ``area`` son los datos laborales que PRD §21.6 ("Mi cuenta")
    exige mostrar. Se leen SIEMPRE del empleado ligado a la cuenta
    autenticada (§32: la identidad viene del token, nunca del cliente) y son
    de SOLO LECTURA: aquí no existe ningún endpoint para modificarlos; los
    datos laborales los administra RH.

    Son NULLABLE a propósito y sin valor por defecto de negocio: ``Empleado``
    admite ``puesto`` y ``area`` nulos (ET §5, estado ``profile_incomplete``
    §30) y este DTO no inventa, completa ni normaliza nada. Para una cuenta RH
    sin ``empleado_id`` salen ``null`` junto con ``empleado_nombre``.
    """

    cuenta_id: int
    email: str
    rol: str
    empleado_id: int | None = None
    empleado_nombre: str | None = None
    puesto: str | None = None
    area: str | None = None
    must_change_password: bool


class PasswordChangeIn(BaseModel):
    """Cambio de contraseña del propio usuario.

    ``password_actual`` es opcional SOLO cuando ``must_change_password=true``
    (la credencial temporal ya se validó en el login): lo decide el servicio.
    """

    password_actual: str | None = None
    password_nueva: str

    @field_validator("password_nueva")
    @classmethod
    def _politica(cls, valor: str) -> str:
        return _validar_politica(valor)


class RecoveryRequestIn(BaseModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def _strip_email(cls, valor: object) -> object:
        return _normalizar_email(valor)


class RecoveryResetIn(BaseModel):
    token: str
    password_nueva: str

    @field_validator("password_nueva")
    @classmethod
    def _politica(cls, valor: str) -> str:
        return _validar_politica(valor)
