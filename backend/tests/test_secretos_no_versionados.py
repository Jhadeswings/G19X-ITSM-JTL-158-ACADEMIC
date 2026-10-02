"""Protección contra la fuga de secretos a archivos versionados.

CONTEXTO (MB-7-IA-SECURITY-HARDENING)
--------------------------------------
Las credenciales reales de IA se escribieron DOS VECES en
``backend/.env.example``, que está versionado por Git. Este módulo es la
red de seguridad automatizada que convierte aquel error en un fallo de
pruebas inmediato, en lugar de una credencial filtrada.

Qué garantiza:

1. ``*.env.example`` nunca contiene valores NO VACÍOS para variables de
   secreto. Las plantillas documentan NOMBRES, no guardan claves.
2. ``backend/.env`` (el archivo real con secretos) está ignorado por Git.
3. ``backend/.env`` está excluido del contexto de build de Docker, para
   que ``COPY . .`` no pueda hornearlo dentro de la imagen.

Diseño (mantenible a propósito):

- NO usa la base de datos ni la app: es una comprobación estática de
  archivos y ``git``, así que corre en cualquier entorno y en segundos.
- NO hay secretos reales en los fixtures: los valores "sospechosos" son
  cadenas sintéticas inequívocamente fake, jamás con formato de clave real.
- Los mensajes de aserción nombran VARIABLE y NÚMERO DE LÍNEA, nunca el
  valor: si esta prueba falla, el log tampoco filtra nada.
"""

import re
import subprocess
from pathlib import Path

import pytest

#TODAS las pruebas de este módulo son estáticas (archivos + git) y NINGUNA
# necesita la base de datos. `pytestmark` las marca `no_db` de una sola vez
# para que el fixture `limpieza` (que hace TRUNCATE CASCADE contra la base
# de datos REAL de desarrollo) las salte por completo. Ejecutar estas
# pruebas nunca debe poder borrar datos de desarrollo.
pytestmark = pytest.mark.no_db

# Raíces: este archivo vive en backend/tests/.
RAIZ_REPO = Path(__file__).resolve().parents[2]
RAIZ_BACKEND = Path(__file__).resolve().parents[1]

# Plantillas versionadas que NUNCA deben llevar secretos.
PLANTILLAS = [
    RAIZ_REPO / ".env.example",
    RAIZ_BACKEND / ".env.example",
    RAIZ_REPO / "frontend" / ".env.example",
]

# Variables de IA: en las plantillas deben estar ESTRICTAMENTE VACÍAS.
VARIABLES_IA = ("GROQ_API_KEY", "GEMINI_API_KEY")

# `SECRET_KEY` es un secreto igualmente, pero el proyecto documenta un
# placeholder en las plantillas ("cambiar-por-una-clave-generada", ET §35).
# Un placeholder documentado NO es una fuga; lo que se prohíbe es un valor
# real. Estos tokens son la lista blanca de valores admitidos.
PLACEHOLDERS_ADMITIDOS = {
    "cambiar-por-una-clave-generada",
    "generar-con-secrets-token-urlsafe",
}

# Cualquier otra variable de secreto: se exige vacío.
VARIABLES_OTRAS_SECRETAS = ("SECRET_KEY",)

# Valor claramente sintético: NO imita el formato de ninguna clave real.
VALOR_FALSO = "VALOR_FALSO_NO_ES_UNA_CLAVE_REAL"


def _es_infraccion(nombre: str, valor: str) -> bool:
    """¿Este par (variable, valor) es una fuga en una plantilla?

    - Variable de IA con cualquier valor  -> fuga (las claves nunca van ahí).
    - Otra variable de secreto con valor que no sea un placeholder
      documentado -> fuga.
    """
    if not valor:
        return False
    if nombre in VARIABLES_IA:
        return True
    if nombre in VARIABLES_OTRAS_SECRETAS:
        return valor.strip().lower() not in PLACEHOLDERS_ADMITIDOS
    return False


def _asignacion(linea: str):
    """Extrae ``(NOMBRE, VALOR)`` de una línea ``CLAVE=valor``.

    Ignora comentarios, líneas en blanco y sangrías. Devuelve ``None`` si
    la línea no es una asignación.
    """
    limpia = linea.strip()
    if not limpia or limpia.startswith("#"):
        return None
    if "=" not in limpia:
        return None
    nombre, _, valor = limpia.partition("=")
    return nombre.strip(), valor.strip()


@pytest.mark.parametrize("plantilla", PLANTILLAS, ids=lambda p: p.name)
def test_plantilla_no_trae_secretos(plantilla: Path):
    """Ninguna plantilla versionada contiene claves con valor."""
    assert plantilla.is_file(), (
        f"Falta la plantilla versionada {plantilla.name}: sin ella nadie "
        "sabe qué variables configurar."
    )

    infractores = []
    for numero, linea in enumerate(
        plantilla.read_text(encoding="utf-8").splitlines(), start=1
    ):
        asignacion = _asignacion(linea)
        if asignacion is None:
            continue
        nombre, valor = asignacion
        if _es_infraccion(nombre, valor):
            # NUNCA se registra `valor`: solo variable y línea.
            infractores.append(f"{nombre} (línea {numero})")

    assert not infractores, (
        f"{plantilla.name} tiene valores NO VACÍOS para variables de "
        f"secreto: {', '.join(infractores)}. Las plantillas deben quedar "
        "vacías; las claves reales van solo en el .env local ignorado."
    )


def test_backend_env_real_esta_ignorado_por_git():
    """``backend/.env`` (el que contiene claves) NO puede versionarse."""
    resultado = subprocess.run(
        ["git", "check-ignore", "-q", "backend/.env"],
        cwd=RAIZ_REPO,
        capture_output=True,
    )
    assert resultado.returncode == 0, (
        "backend/.env NO está ignorado por Git: las claves reales podrían "
        "terminar en un commit. Revisar .gitignore."
    )


def test_plantillas_siguen_versionables():
    """El endurecimiento de .gitignore NO debe romper las plantillas.

    Guardarraíl del refactor: si alguien aprieta demasiado los patrones,
    las plantillas dejarían de poder versionarse.
    """
    for plantilla in PLANTILLAS:
        relativa = plantilla.relative_to(RAIZ_REPO).as_posix()
        resultado = subprocess.run(
            ["git", "check-ignore", "-q", relativa],
            cwd=RAIZ_REPO,
            capture_output=True,
        )
        assert resultado.returncode != 0, (
            f"{relativa} está siendo ignorado: la plantilla debe poder "
            "versionarse (falta el patrón `!` en .gitignore)."
        )


def test_dotenv_excluye_secretos_del_contexto_docker():
    """``backend/.env`` NO puede entrar al build context de la imagen.

    Sin esto, ``COPY . .`` del Dockerfile copiaría el archivo con claves
    dentro de la imagen Docker.
    """
    dockerignore = RAIZ_BACKEND / ".dockerignore"
    assert dockerignore.is_file(), (
        "Falta backend/.dockerignore: `COPY . .` copiaría backend/.env "
        "(con las claves) dentro de la imagen Docker."
    )

    reglas = [
        linea.strip()
        for linea in dockerignore.read_text(encoding="utf-8").splitlines()
        if linea.strip() and not linea.strip().startswith("#")
    ]

    # Debe existir una regla que excluya `.env`…
    assert any(regla.lstrip("!") == ".env" for regla in reglas), (
        "backend/.dockerignore no excluye `.env`: el archivo de claves "
        "entraría en la imagen Docker."
    )

    # …y la ÚNICA re-inclusión permitida debe ser la plantilla.
    reinclusiones = sorted(
        regla for regla in reglas if regla.startswith("!") and "env" in regla
    )
    assert reinclusiones == ["!.env.example"], (
        "backend/.dockerignore solo debe re-incluir la plantilla; "
        f"re-inclusiones inesperadas: {reinclusiones}"
    )


def test_dockerfile_copy_total_depende_de_dockerignore():
    """Guardarraíl de la dependencia ``COPY . .`` → ``.dockerignore``.

    Si el Dockerfile deja de usar ``COPY . .`` este test no falla: solo
    documenta que, mientras exista, la exclusión es la que protege.
    """
    dockerfile = (RAIZ_BACKEND / "Dockerfile").read_text(encoding="utf-8")
    if re.search(r"^COPY\s+\.\s+\.\s*$", dockerfile, re.M):
        assert (RAIZ_BACKEND / ".dockerignore").is_file(), (
            "El Dockerfile usa `COPY . .` pero no hay .dockerignore: los "
            "secretos entrarían en la imagen."
        )


def test_deteccion_de_valor_no_vacio():
    """Auto-prueba del detector: un valor falso SÍ debe detectarse.

    Si esto pasara sin detectar el valor, el test de plantillas estaría
    dando un falso negativo y no protegería nada.
    """
    asignacion = _asignacion(f"GROQ_API_KEY={VALOR_FALSO}")
    assert asignacion is not None
    nombre, valor = asignacion
    assert nombre == "GROQ_API_KEY"
    assert valor  # no vacío
    assert _es_infraccion(nombre, valor)  # ⇒ el detector marca infractor
    assert not _es_infraccion("GROQ_API_KEY", "")  # vacío ⇒ seguro
    assert _asignacion("# GROQ_API_KEY=comentario") is None

    # SECRET_KEY: un valor real es fuga, un placeholder documentado no.
    assert _es_infraccion("SECRET_KEY", VALOR_FALSO)
    assert not _es_infraccion("SECRET_KEY", "cambiar-por-una-clave-generada")

    # Variables que NO son secretos nunca se marcan.
    assert not _es_infraccion("GROQ_MODEL", "openai/gpt-oss-120b")
    assert not _es_infraccion("TZ", "America/Mexico_City")