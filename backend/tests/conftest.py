"""Fixtures compartidos de la suite (Fase 3).

Reglas:
- El esquema evoluciona SOLO con Alembic: prohibido ``create_all`` (§1).
- Los tests corren contra el PostgreSQL real de Docker (nunca SQLite).
- Cada test arranca y termina con las tablas limpias (TRUNCATE CASCADE).
"""

import os

# Variables de entorno ANTES de importar cualquier módulo de la app:
# ``Settings`` se instancia al importar ``app.core.db`` y ``get_settings``
# está cacheado. Se usa una clave de firma exclusiva de la suite y bcrypt
# con coste bajo para acelerar (solo afecta a los tests).
os.environ.setdefault(
    "SECRET_KEY", "clave-exclusiva-de-tests-jwt-0123456789abcdef"
)
os.environ.setdefault("BCRYPT_LOG_ROUNDS", "4")

from alembic import command  # noqa: E402
from alembic.config import Config as AlembicConfig  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.db import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from tests.helpers import crear_cuenta, crear_empleado  # noqa: E402

# TRUNCATE de TODAS las tablas de dominio (mismo criterio que
# tests/sql/fase2_restricciones.sql), incluida la nueva de Fase 3.
_TABLAS = (
    "tokens_recuperacion, auditorias_modificacion, evaluaciones, "
    "participaciones, capacitaciones, proyectos, cuentas_acceso, empleados"
)


@pytest.fixture(scope="session", autouse=True)
def esquema():
    """Aplica las migraciones de Alembic una vez por sesión (nunca create_all)."""
    command.upgrade(AlembicConfig("alembic.ini"), "head")
    yield


@pytest.fixture(autouse=True)
def limpieza():
    """Estado limpio antes y después de cada test."""
    with engine.begin() as conexion:
        conexion.execute(text(f"TRUNCATE TABLE {_TABLAS} RESTART IDENTITY CASCADE"))
    yield
    with engine.begin() as conexion:
        conexion.execute(text(f"TRUNCATE TABLE {_TABLAS} RESTART IDENTITY CASCADE"))


@pytest.fixture()
def db():
    sesion = SessionLocal()
    try:
        yield sesion
    finally:
        sesion.close()


@pytest.fixture()
def cuenta_rh(db):
    """Cuenta RH sin empleado asociado (RH puede existir sin empleado_id, §4.1)."""
    return crear_cuenta(db, rol="RH", email="rh@empresa.dev")


@pytest.fixture()
def cuenta_empleado(db):
    """Cuenta EMPLEADO con relación 1:1 a Empleado (§4.1)."""
    empleado = crear_empleado(db)
    return crear_cuenta(
        db, rol="EMPLEADO", email="empleado@empresa.dev", empleado=empleado
    )


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)
