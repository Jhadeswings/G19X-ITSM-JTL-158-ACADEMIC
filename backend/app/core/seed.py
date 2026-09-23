"""Seed idempotente del usuario RH inicial (Fase 3).

Especificación Técnica v1.5 §35: el usuario RH inicial debe crearse de
forma idempotente y segura ante concurrencia.

- Credenciales EXCLUSIVAMENTE desde variables de entorno
  (``SEED_RH_EMAIL`` / ``SEED_RH_PASSWORD``): nunca hardcodeadas ni
  versionadas.
- La contraseña del seed también debe cumplir la política del PRD §3.5.
- Idempotente: si la cuenta ya existe, no hace nada.
- Seguro ante concurrencia: el índice UNIQUE sobre ``lower(email)`` es la
  barrera final; una carrera se resuelve capturando ``IntegrityError``.

Ejecución: ``python -m app.core.seed`` (docker-compose lo ejecuta después
de ``alembic upgrade head``).
"""

import logging
import sys

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.core.security import hash_password, validar_politica_password
from app.models.cuenta_acceso import CuentaAcceso

logger = logging.getLogger(__name__)


def seed_rh(db: Session) -> bool:
    """Crea la cuenta RH inicial si no existe.

    Devuelve True solo si la creó en esta ejecución.
    """
    from app.core.config import get_settings

    settings = get_settings()
    email = (settings.SEED_RH_EMAIL or "").strip().lower()
    password = settings.SEED_RH_PASSWORD or ""

    if not email or not password:
        logger.error(
            "Seed de RH abortado: SEED_RH_EMAIL y SEED_RH_PASSWORD son "
            "obligatorios (variables de entorno, nunca hardcodeadas)."
        )
        raise SystemExit(1)

    errores = validar_politica_password(password)
    if errores:
        logger.error(
            "Seed de RH abortado: SEED_RH_PASSWORD no cumple la política "
            "del PRD §3.5 (mínimo 8 caracteres y al menos un número)."
        )
        raise SystemExit(1)

    existente = db.scalar(
        select(CuentaAcceso).where(
            func.lower(CuentaAcceso.email) == email,
        )
    )
    if existente is not None:
        logger.info("Seed de RH: la cuenta %s ya existe. Nada que hacer.", email)
        return False

    db.add(
        CuentaAcceso(
            rol="RH",
            email=email,
            password_hash=hash_password(password),
            activo=True,
            must_change_password=False,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        # Carrera con otra ejecución simultánea del seed: el UNIQUE sobre
        # lower(email) garantiza que solo una gane.
        db.rollback()
        logger.info(
            "Seed de RH: la cuenta %s fue creada concurrentemente. Nada que hacer.",
            email,
        )
        return False

    logger.info("Seed de RH: cuenta %s creada.", email)
    return True


def main() -> int:
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        seed_rh(db)
    return 0


if __name__ == "__main__":
    sys.exit(main())
