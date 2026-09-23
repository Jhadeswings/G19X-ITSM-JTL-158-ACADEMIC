"""Entorno de Alembic.

La URL de conexión proviene de la configuración de la app
(``app.core.config``), de modo que las migraciones usen exactamente la misma
cadena ``DATABASE_URL`` que el backend.

Nota de fase (scaffolding): no hay modelos de dominio todavía. Cuando se
creen, importarlos aquí (``import app.models``) para que ``autogenerate``
los detecte. El esquema evoluciona SOLO mediante Alembic
(Especificación Técnica v1.5 §1: prohibido ``create_all()``).
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import get_settings
from app.core.db import Base

# Modelos de dominio: imprescindible importarlos para que ``autogenerate``
# los detecte (§33). El esquema evoluciona SOLO mediante Alembic.
import app.models  # noqa: F401

config = context.config

if config.config_file_name is not None:
    # disable_existing_loggers=False: fileConfig() por defecto DESACTIVA los
    # loggers ya existentes (incluidos los de la propia app cuando las
    # migraciones se ejecutan desde la aplicación o desde los tests).
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# Inyectar la URL real desde la configuración de la aplicación.
config.set_main_option("sqlalchemy.url", get_settings().DATABASE_URL)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Ejecuta migraciones en modo 'offline' (genera SQL sin conectar)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Ejecuta migraciones conectándose a la base de datos."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
