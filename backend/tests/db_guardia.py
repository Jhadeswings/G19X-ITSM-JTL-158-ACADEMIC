"""Barrera de seguridad: la suite SOLO puede truncar una BD de pruebas.

CONTEXTO (MB-7-TEST-SAFETY)
---------------------------
El fixture ``limpieza`` hace ``TRUNCATE ... CASCADE`` antes y después de
cada test. Durante MB-7-IA-SECURITY-HARDENING ese TRUNCATE se ejecutó
contra la base de datos de DESARROLLO y vació los datos del proyecto.

Este módulo es la barrera principal contra esa repetición. Es lógica pura
y sin dependencias de la app, para poder importarse y probarse aislado.

Principio de diseño: **fallar en cerrado** (fail-closed). Si no se puede
DEMOSTRAR que la conexión apunta a una base de pruebas, se aborta. Nunca
se asume que "probably es la de pruebas".

Reglas:

1. El nombre de la base debe empezar por el prefijo de pruebas
   (``talento_test``). Es la condición necesaria y suficiente.
2. La base de desarrollo (``talento_alto_potencial``) se rechaza SIEMPRE,
   aunque venga por un host inesperado.
3. Cualquier URL ambigua, vacía o mal formada se rechaza.
"""

from urllib.parse import urlsplit

# Base de datos de DESARROLLO: prohibido para la suite.
BD_DESARROLLO = "talento_alto_potencial"

# Toda base válida para pruebas DEBE empezar por este prefijo.
PREFIJO_BD_PRUEBAS = "talento_test"

# Sufijos refining: una BD de pruebas puede llevar sufijo de rama/orden,
# p. ej. `talento_test_mb72`.
SUFIJOS_BD_PRUEBAS_ADMITIDOS = ("", "_")


class BaseDeDatosNoPermitida(RuntimeError):
    """Se intentó usar una base de datos que la suite no puede truncar.

    Hereda de ``RuntimeError`` para que pytest la reporte como error de
    configuración y no como fallo de un test de negocio.
    """


def nombre_de_la_base(url: str) -> str:
    """Extrae el ``dbname`` de una URL de SQLAlchemy/PostgreSQL.

    Lanza ``BaseDeDatosNoPermitida`` si la URL no es utilizable.
    """
    if not url or not url.strip():
        raise BaseDeDatosNoPermitida(
            "DATABASE_URL vacía: no se puede demostrar el aislamiento. "
            "Aborting para no truncar una base desconocida."
        )
    try:
        partes = urlsplit(url.strip())
    except ValueError as error:
        raise BaseDeDatosNoPermitida(
            f"DATABASE_URL no es una URL válida: {error}"
        ) from error
    nombre = (partes.path or "").lstrip("/")
    if not nombre:
        raise BaseDeDatosNoPermitida(
            "DATABASE_URL no indica un nombre de base de datos. "
            "Aborting para no truncar una base desconocida."
        )
    return nombre


def es_base_de_pruebas(nombre: str) -> bool:
    """¿Este nombre corresponde a una base desechable de pruebas?

    Debe empezar por ``talento_test`` y no ser la base de desarrollo.
    """
    if not nombre:
        return False
    if nombre == BD_DESARROLLO:
        return False
    if not nombre.startswith(PREFIJO_BD_PRUEBAS):
        return False
    sufijo = nombre[len(PREFIJO_BD_PRUEBAS):]
    return sufijo in SUFIJOS_BD_PRUEBAS_ADMITIDOS or sufijo.startswith("_")


def verificar_url_de_pruebas(url: str) -> str:
    """Verifica que ``url`` apunte a una BD de pruebas y devuelve su nombre.

    Es el punto de control único: se llama ANTES de cualquier TRUNCATE y en
    la importacion de la suite, antes de que se cree el engine.

    Lanza:
        BaseDeDatosNoPermitida: si la URL no es demostrablemente de pruebas.
    """
    nombre = nombre_de_la_base(url)

    # Mensaje explícito para el caso más probable y más grave.
    if nombre == BD_DESARROLLO:
        raise BaseDeDatosNoPermitida(
            f"REFUZADO: la suite apunta a la base de DESARROLLO "
            f"'{BD_DESARROLLO}'. Ejecutar pytest contra ella BORRA todos sus "
            "datos. Configure una base de pruebas (prefijo "
            f"'{PREFIJO_BD_PRUEBAS}'). Ver README: 'Ejecutar la suite "
            "backend'."
        )

    if not es_base_de_pruebas(nombre):
        raise BaseDeDatosNoPermitida(
            f"REFUZADO: la base '{nombre}' no es una base de pruebas "
            f"aislada. Debe empezar por '{PREFIJO_BD_PRUEBAS}' y ser "
            f"distinta de '{BD_DESARROLLO}'."
        )

    return nombre


def construir_url_de_pruebas(url_base: str, nombre: str) -> str:
    """Devuelve ``url_base`` apuntando a la base ``nombre``.

    Conserva usuario, contraseña, host y puerto: solo cambia la base. Se
    usa para derivar la URL de pruebas desde la de desarrollo sin pedir
    que nadie recuerde escribirla a mano.
    """
    partes = urlsplit(url_base.strip())
    nueva_ruta = f"/{nombre}"
    return partes._replace(path=nueva_ruta).geturl()