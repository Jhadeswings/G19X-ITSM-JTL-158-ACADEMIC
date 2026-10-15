"""Utilidades compartidas por la suite de tests (Fase 3).

Se importa desde ``conftest.py`` y desde los módulos de test. NO es código
de producción.
"""

import re

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.cuenta_acceso import CuentaAcceso
from app.models.empleado import Empleado

# Contraseña válida por defecto (cumple PRD §3.5: >=8 caracteres, >=1 número).
PASSWORD_PRUEBA = "Clave1234"

URL_LOGIN = "/api/v1/auth/login"
URL_RENOVAR = "/api/v1/auth/renew"
URL_ME = "/api/v1/me"
URL_CAMBIO = "/api/v1/auth/password/change"
URL_RECUPERACION = "/api/v1/auth/recovery/request"
URL_RESET = "/api/v1/auth/recovery/reset"

# Fase 4A
URL_RH_EMPLEADOS = "/api/v1/rh/employees"
URL_RH_PROYECTOS = "/api/v1/rh/projects"
URL_ME_PROYECTOS = "/api/v1/me/projects"
URL_BUSQUEDA_PROYECTOS = f"{URL_ME_PROYECTOS}/search"

# Fase 4B
URL_ME_PARTICIPACIONES = "/api/v1/me/participations"
URL_RH_PARTICIPACIONES = "/api/v1/rh/participations"
URL_RH_EMPLEADO_PARTICIPACIONES = "/api/v1/rh/employees/{empleado_id}/participations"
# RH-02.1: participantes de un proyecto (detalle del proyecto en RH).
URL_RH_PROYECTO_PARTICIPACIONES = "/api/v1/rh/projects/{proyecto_id}/participations"
URL_ME_CAPACITACIONES = "/api/v1/me/trainings"

# Fase 6
URL_RH_EVALUACIONES = "/api/v1/rh/evaluations"
URL_RH_GENERAR_EVALUACIONES = f"{URL_RH_EVALUACIONES}/generate"
URL_RH_EMPLEADO_EVALUACIONES = (
    "/api/v1/rh/employees/{empleado_id}/evaluations"
)
URL_ME_EVALUACIONES = "/api/v1/me/evaluations"

# Fase 7 (búsqueda manual de talento)
URL_RH_BUSQUEDA_MANUAL = "/api/v1/rh/talent-search/manual"

# Fase 8 (interpretación con lenguaje natural)
URL_RH_INTERPRETAR_BUSQUEDA = "/api/v1/rh/talent-search/interpret"

# Fase 9 (mentoría)
URL_RH_MENTORIA_SUGGEST = "/api/v1/rh/mentorship/suggest"

# Fase 10 (brechas y atención requerida)
URL_RH_GAPS = "/api/v1/rh/gaps"
URL_RH_ATTENTION = "/api/v1/rh/attention-required"

# Fase 11 (comparación de empleados)
URL_RH_COMPARACION = "/api/v1/rh/employees/compare"

# Fase 12 (recomendación de desarrollo con IA)
URL_ME_RECOMENDACION = "/api/v1/me/progress/recommendation"

# MB-7-1 (ET §31): resultado actual del Empleado autenticado, sin IA
URL_ME_RESULTADO = "/api/v1/me/result"

# Fase 13 (resultado actual vigente por empleado, exclusivo RH)
URL_RH_EMPLEADO_RESULTADO = "/api/v1/rh/employees/{empleado_id}/result"
URL_RH_EMPLEADO_NINE_BOX = "/api/v1/rh/employees/{empleado_id}/nine-box"

# PRD v1.4 §20.2.1 / ET v1.6 §31.1 (recomendación de desarrollo para RH)
URL_RH_EMPLEADO_RECOMENDACION = (
    "/api/v1/rh/employees/{empleado_id}/recommendation"
)

# Tarea C (consulta de auditoría para RH; PRD §22, ET §25)
URL_RH_AUDITS = "/api/v1/rh/audits"

# Historial de correcciones de MIS participaciones (Empleado; PRD §22, ET §25/§32)
URL_ME_AUDITS = "/api/v1/me/audits"


def cabecera(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def crear_empleado(
    db: Session,
    nombre: str = "Empleado Prueba",
    puesto: str | None = None,
    area: str | None = None,
) -> Empleado:
    """Empleado de prueba.

    ``puesto`` y ``area`` son opcionales y NULABLES por defecto a propósito:
    ``Empleado`` los admite nulos (ET §5, estado ``profile_incomplete`` §30) y
    el resto de la suite no los necesita. ``GET /me`` los expone tal cual, sin
    inventar valores (MB-6-1).
    """
    empleado = Empleado(nombre=nombre, puesto=puesto, area=area, activo=True)
    db.add(empleado)
    db.commit()
    db.refresh(empleado)
    return empleado


def crear_cuenta(
    db: Session,
    *,
    rol: str,
    email: str,
    empleado: Empleado | None = None,
    activo: bool = True,
    must_change_password: bool = False,
    password: str = PASSWORD_PRUEBA,
) -> CuentaAcceso:
    cuenta = CuentaAcceso(
        rol=rol,
        email=email.lower(),
        password_hash=hash_password(password),
        activo=activo,
        must_change_password=must_change_password,
        empleado_id=empleado.id if empleado is not None else None,
    )
    db.add(cuenta)
    db.commit()
    db.refresh(cuenta)
    return cuenta


def login_y_token(
    cliente: TestClient, email: str, password: str = PASSWORD_PRUEBA
) -> str:
    """Login correcto garantizado: devuelve el access_token."""
    respuesta = cliente.post(URL_LOGIN, json={"email": email, "password": password})
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()["access_token"]


def correos_a(transporte, destinatario: str) -> list:
    """Correos capturados por el proveedor simulado hacia ``destinatario``."""
    return [
        mensaje
        for mensaje in transporte.aceptados
        if destinatario in (mensaje["To"] or "")
    ]


def secreto_de_correo(transporte, marcador: str) -> str:
    """Extrae el secreto de un correo capturado por el proveedor simulado.

    ``marcador`` es la etiqueta que precede al secreto en la plantilla
    (p. ej. ``"Credencial temporal"`` o ``"Token de restablecimiento"``),
    que lo escribe como ``"<marcador>: <secreto>"`` en línea propia.

    Sustituye al antiguo ``extraer_de_log``: los secretos ya NO se
    registran en logs; se entregan por correo y la suite los captura del
    proveedor simulado.
    """
    patron = re.compile(rf"{re.escape(marcador)}:\s*(\S+)")
    for mensaje in reversed(transporte.aceptados):
        coincidencia = patron.search(mensaje.get_content())
        if coincidencia:
            return coincidencia.group(1)
    raise AssertionError(f"El correo capturado no contiene: {marcador}")
