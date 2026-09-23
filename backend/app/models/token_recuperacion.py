"""Modelo TokenRecuperacion (Fase 3).

Tokens de un solo uso para restablecimiento de contraseña:

- Se almacena SOLO el hash SHA-256 del token, nunca el token en claro
  (mismo principio que las contraseñas).
- ``expira_en`` + ``usado`` permiten expiración y un solo uso.
- La tabla existe porque el flujo de recuperación lo exige; no sustituye
  sesiones (los JWT de acceso son stateless, ver DECISIONES_TECNICAS.md).
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin


class TokenRecuperacion(TimestampMixin, Base):
    __tablename__ = "tokens_recuperacion"

    id: Mapped[int] = mapped_column(primary_key=True)
    cuenta_id: Mapped[int] = mapped_column(
        ForeignKey("cuentas_acceso.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expira_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    usado: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )

    cuenta: Mapped["CuentaAcceso"] = relationship()

    def __repr__(self) -> str:  # pragma: no cover
        return f"<TokenRecuperacion id={self.id} cuenta_id={self.cuenta_id} usado={self.usado}>"
