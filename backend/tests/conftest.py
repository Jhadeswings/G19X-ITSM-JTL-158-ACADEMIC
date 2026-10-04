"""Fixtures compartidos de la suite (Fase 3).

Reglas:
- El esquema evoluciona SOLO con Alembic: prohibido ``create_all`` (§1).
- Los tests corren contra PostgreSQL real de Docker (nunca SQLite).
- Cada test arranca y termina con las tablas limpias (TRUNCATE CASCADE).

AISLAMIENTO DE LA BASE DE DATOS (MB-7-TEST-SAFETY)
---------------------------------------------------
El TRUNCATE de este módulo borra datos. Para que NUNCA pueda alcanzar la
base de desarrollo:

1. Al IMPORTAR este archivo (antes de que exista el engine) se deriva una
   ``DATABASE_URL`` de pruebas a partir de la configurada, y se verifica
   con ``tests.db_guardia``. Si no puede demostrarse que es una base de
   pruebas, la importacion aborta: no se crea ningún engine y no se
   ejecuta nada.
2. El fixture ``limpieza`` vuelve a verificarlo en CADA test, ya con la
   conexion real abierta, por si alguien cambiara ``DATABASE_URL`` entre
  tests.

El usuario no necesita recordar ninguna variable: si no se define
``TEST_DATABASE_URL``, la suite la deriva automáticamente.
"""

import os
import sys
from pathlib import Path

# El paquete `tests` debe ser importable aquí (conftest se carga antes que
# pythonpath de pytest en algunos órdenes de importación).
RAIZ_BACKEND = Path(__file__).resolve().parents[1]
if str(RAIZ_BACKEND) not in sys.path:
    sys.path.insert(0, str(RAIZ_BACKEND))

from tests.db_guardia import (  # noqa: E402
    PREFIJO_BD_PRUEBAS,
    construir_url_de_pruebas,
    verificar_url_de_pruebas,
)

# Variables de entorno ANTES de importar cualquier módulo de la app:
# ``Settings`` se instancia al importar ``app.core.db`` y ``get_settings``
# está cacheado. Se usa una clave de firma exclusiva de la suite y bcrypt
# con coste bajo para acelerar (solo afecta a los tests).
os.environ.setdefault(
    "SECRET_KEY", "clave-exclusiva-de-tests-jwt-0123456789abcdef"
)
os.environ.setdefault("BCRYPT_LOG_ROUNDS", "4")

# --- AISLAMIENTO DE PROVEEDORES DE IA (MB-7-1A) ---------------------------
# La suite NO debe heredar las claves reales de ``backend/.env`` (Groq/Gemini).
# Con una clave presente, ``construir_orchestrator()`` construye un proveedor
# REAL y el test que simula "IA no disponible" acaba llamando a la red y
# devolviendo una recomendación: la suite deja de ser determinista, consume
# cuota y filtra una respuesta externa a una aserción.
#
# Aquí se ANULAN las dos claves. Se usa asignación directa (no ``setdefault``)
# a propósito: el objetivo es que la variable quede fijada por la suite
# aunque el entorno o el `.env`` local traigan una clave. Las variables de
# entorno tienen PRECEDENCIA sobre ``env_file`` en pydantic-settings, de modo
# que esto pisa el `.env`` sin tocarlo ni modificar la configuración de la
# aplicación en desarrollo.
#
# El valor es la CADENA VACÍA, no un valor inventado tipo ``"test"``: la
# fábrica decide por verdad (``if settings.GROQ_API_KEY:``), y "" es el valor
# de absence que la propia configuración ya define como predeterminado
# (`GROQ_API_KEY: str = ""`). Un valor ficticio no vacío se trataría como
# credencial real y provocaría llamadas de red. Coincide además con lo que
# `tests/test_secretos_no_versionados.py` considera seguro.
#
# NO rompe los tests que necesitan proveedores: todos ellos inyectan un doble
# con `parchear_orchestrator`, que sustituye la fábrica completa y no depende
# de estas variables.
for _variable_ia in ("GROQ_API_KEY", "GEMINI_API_KEY"):
    os.environ[_variable_ia] = ""

def _leer_url_configurada() -> str:
    """Devuelve la ``DATABASE_URL`` de la configuración local del backend.

    Orden de precedencia:
    1. ``TEST_DATABASE_URL`` del entorno (si alguien la define explícitamente).
    2. ``DATABASE_URL`` del entorno.
    3. ``DATABASE_URL`` de ``backend/.env``.

    Se lee el archivo de forma mínima y explícita, sin cargar pydantic
    (todavía no se importa la app).
    """
    desde_entorno = os.environ.get("TEST_DATABASE_URL") or os.environ.get(
        "DATABASE_URL"
    )
    if desde_entorno:
        return desde_entorno

    archivo_env = RAIZ_BACKEND / ".env"
    if archivo_env.is_file():
        for linea in archivo_env.read_text(encoding="utf-8").splitlines():
            limpia = linea.strip()
            if limpia.startswith("DATABASE_URL="):
                return limpia.partition("=")[2].strip()
    return ""


# --- Barrera de aislamiento (ANTES de importar app.core.db) ---------------
# Se deriva la URL de pruebas y se sobreescribe ``DATABASE_URL`` para que el
# engine de la aplicación apunte ahí desde su creación. Si la verificación
# falla, se aborta la IMPORTACIÓN: es preferible no ejecutar la suite a
# ejecutar un TRUNCATE sobre la base equivocada.
_URL_PRUEBAS = os.environ.get("TEST_DATABASE_URL") or construir_url_de_pruebas(
    _leer_url_configurada(), PREFIJO_BD_PRUEBAS
)

# Aborta aquí si la URL no es demostrablemente de pruebas.
verificar_url_de_pruebas(_URL_PRUEBAS)
os.environ["DATABASE_URL"] = _URL_PRUEBAS
# -------------------------------------------------------------------------

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


# Marca para pruebas que NO deben tocar la base de datos (p. ej. las de
# seguridad de secretos, que solo inspeccionan archivos y git).
# Uso: @pytest.mark.no_db
# Registrada en pytest.ini para que el marcador sea explícito y no genere
# warnings de "unknown mark".
no_db = pytest.mark.no_db


@pytest.fixture(scope="session")
def esquema():
    """Aplica las migraciones de Alembic una vez por sesión (nunca create_all).

    NO es ``autouse`` a propósito: las pruebas estáticas marcadas ``no_db``
    no deben abrir conexión ni exigir que exista una base de pruebas. Los
    fixtures que sí necesitan esquema (``db`` y ``client``) dependen
    explícitamente de este.
    """
    command.upgrade(AlembicConfig("alembic.ini"), "head")
    yield


def _afirmar_bd_de_pruebas(conexion) -> str:
    """Segunda barrera: confirma en la CONEXIÓN real a qué base se apunta.

    La verificación de importación usa la URL configurada; esta usa el
    ``current_database()`` que devuelve el servidor. Así también se
    detecta un desvío en tiempo de ejecución.

    Se ejecuta justo antes de cada TRUNCATE.
    """
    nombre_real = conexion.execute(text("SELECT current_database()")).scalar()
    verificar_url_de_pruebas(f"postgresql://x/{nombre_real}")
    return nombre_real


@pytest.fixture(autouse=True)
def limpieza(request):
    """Estado limpio antes y después de cada test.

    Las pruebas marcadas con ``@pytest.mark.no_db`` NO tocan la base de
    datos: se salta el TRUNCATE por completo. Es una optimización (evita
    abrir conexiones), NO la barrera de seguridad: la barrera real es
    ``tests.db_guardia``, que actúa incluso sobre tests con BD.
    """
    if request.node.get_closest_marker("no_db"):
        yield
        return
    with engine.begin() as conexion:
        _afirmar_bd_de_pruebas(conexion)
        conexion.execute(text(f"TRUNCATE TABLE {_TABLAS} RESTART IDENTITY CASCADE"))
    yield
    with engine.begin() as conexion:
        _afirmar_bd_de_pruebas(conexion)
        conexion.execute(text(f"TRUNCATE TABLE {_TABLAS} RESTART IDENTITY CASCADE"))


@pytest.fixture()
def db(esquema):
    """Sesión contra la base de PRUEBAS (nunca la de desarrollo).

    Depende de ``esquema`` para que el esquema exista antes de usarlo.
    """
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
def client(esquema):
    """Cliente de prueba. Depende de ``esquema`` (base de pruebas)."""
    return TestClient(app)
