"""Servicio de gestión de empleados (Fase 4A).

Reglas de los documentos:
- RH registra: nombre, correo de acceso, puesto, área, fecha de ingreso
  (PRD §3.3).
- El correo vive SOLO en CuentaAcceso (§4.1): nunca se duplica en Empleado.
- La cuenta inicial de empleado usa credencial temporal y
  ``must_change_password = true`` (§4.2, PRD §3.3).
- Las credenciales NUNCA se exponen en respuestas API: se entregan
  EXCLUSIVAMENTE por correo (proveedor SMTP configurable, DECISIONES
  TECNICAS §53) dentro de la transacción del alta.
- ``Empleado.activo`` y ``CuentaAcceso.activo`` son estados SEPARADOS:
  desactivar un empleado NO modifica su cuenta (relación no definida por
  los documentos; ver DECISIONES_TECNICAS.md).
"""

import logging
import secrets

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.core.security import hash_password, validar_politica_password
from app.models.cuenta_acceso import CuentaAcceso
from app.models.empleado import Empleado
from app.schemas.empleado import EmpleadoCreateIn, EmpleadoUpdateIn
from app.services import correo_service
from app.services.auth_service import normalizar_email

logger = logging.getLogger(__name__)

MAX_POR_PAGINA = 100
POR_PAGINA_DEFECTO = 20


def _normalizar_para_comparacion(texto: str | None) -> str:
    """Normaliza un valor de área para compararlo con la columna.

    Transformación: minúsculas, sin espacios exteriores y con los espacios
    internos colapsados. Es EXACTAMENTE la misma que ``_area_normalizada_sql``
    aplica sobre la columna, de modo que ambos lados de la comparación son
    simétricos.

    Se mantiene la igualdad EXACTA (no hay ``contains`` ni búsqueda parcial) y
    el acento es significativo: "Tecnología" coincide con "Tecnología" en
    cualquier combinación de mayúsculas y espacios, pero no con "Tecnologia".

    Por qué NO se usa aquí ``normalizar_nombre`` (§7, que además descompone
    Unicode y elimina diacríticos): la columna conserva los acentos tal cual
    los escribió RH, así que aplicarlo solo al parámetro dejaba el filtro vacío.
    Desacoplar ambos lados no exige ``unaccent`` ni migración de esquema.
    """
    if not texto:
        return ""
    return " ".join(texto.strip().lower().split())


def _columna_normalizada(columna):
    """Expresión SQL equivalente a ``_normalizar_para_comparacion`` para
    cualquier columna de texto (área, nombre, puesto...).

    ``regexp_replace`` pertenece al núcleo de PostgreSQL (no requiere ninguna
    extensión): colapsa cualquier secuencia de espacios en un único espacio y
    el ``trim`` exterior elimina el que queda en los extremos. Así la columna
    recibe la MISMA transformación que el parámetro.
    """
    colapsada = func.regexp_replace(func.lower(columna), r"\s+", " ", "g")
    return func.trim(colapsada)


def _area_normalizada_sql():
    """Expresión SQL del área con la misma normalización del parámetro.

    La comparación sigue siendo EXACTA (ni parcial ni insensible a acentos).
    """
    return _columna_normalizada(Empleado.area)


def generar_credencial_temporal() -> str:
    """Genera una credencial temporal segura que cumple la política §3.5."""
    while True:
        # Prefijo de 6 dígitos garantiza al menos un número; token_urlsafe
        # aporta entropía. Longitud final muy superior a 8 caracteres.
        credencial = f"Temporal{secrets.randbelow(10**6):06d}-{secrets.token_urlsafe(6)}"
        # Validar la política del PRD §3.5: solo se acepta si NO hay errores.
        if validar_politica_password(credencial):
            continue
        return credencial


def crear_empleado(db: Session, datos: EmpleadoCreateIn) -> Empleado:
    """Crea Empleado + CuentaAcceso en una sola transacción (PRD §3.3).

    La credencial temporal se entrega SOLO por correo y el envío ocurre
    DENTRO de la transacción, ANTES del commit (DECISIONES §53): si el
    proveedor no está configurado o no acepta el mensaje, se hace rollback
    y responde 503 — jamás queda creada una cuenta cuya credencial nadie
    recibió ni se declara un envío que no ocurrió.
    """
    email = normalizar_email(datos.email)

    ya_existe = db.scalar(
        select(CuentaAcceso).where(func.lower(CuentaAcceso.email) == email)
    )
    if ya_existe is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una cuenta con ese correo de acceso.",
        )

    empleado = Empleado(
        nombre=datos.nombre.strip(),
        puesto=datos.puesto,
        area=datos.area,
        fecha_ingreso=datos.fecha_ingreso,
        activo=True,
    )
    credencial = generar_credencial_temporal()
    cuenta = CuentaAcceso(
        rol="EMPLEADO",
        email=email,
        password_hash=hash_password(credencial),
        activo=True,
        must_change_password=True,  # §4.2: credencial temporal
    )
    empleado.cuenta = cuenta  # relación 1:1
    db.add(empleado)
    # IDs sin persistir todavía: el envío del correo ocurre antes del
    # commit para poder deshacer TODO si el proveedor falla.
    db.flush()
    try:
        correo_service.enviar_correo(
            correo_service.construir_correo_credencial_temporal(
                empleado.nombre, email, credencial
            )
        )
    except correo_service.ErrorCorreo as error:
        db.rollback()
        # El log registra la CAUSA y el destinatario, jamás la credencial.
        logger.error(
            "Alta cancelada: el correo con la credencial temporal no pudo "
            "enviarse a %s (%s). La cuenta no se creó.",
            email,
            type(error).__name__,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "No pudimos enviar el correo con la credencial temporal. "
                "Inténtalo de nuevo en unos momentos."
            ),
        ) from error
    db.commit()
    db.refresh(empleado)
    return empleado


def obtener_empleado(db: Session, empleado_id: int) -> Empleado:
    empleado = db.scalar(
        select(Empleado)
        .options(joinedload(Empleado.cuenta))
        .where(Empleado.id == empleado_id)
    )
    if empleado is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Empleado no encontrado."
        )
    return empleado


def listar_empleados(
    db: Session,
    *,
    pagina: int = 1,
    por_pagina: int = POR_PAGINA_DEFECTO,
    activo: bool | None = None,
    area: str | None = None,
    q: str | None = None,
) -> tuple[list[Empleado], int]:
    """Lista paginada de empleados (§40: paginar listas RH, no cargar todo).

    ``q`` es la búsqueda por nombre/puesto del PRD §20.1: coincidencia PARCIAL
    (``contains``) e insensible a mayúsculas/espacios, ejecutada por el
    backend sobre ambos campos con la misma normalización simétrica del filtro
    de área. El acento sigue siendo significativo (sin ``unaccent``), igual
    que en ``area``. ``area`` conserva su semántica EXACTA: son conceptos
    distintos y componen con AND.
    """
    por_pagina = min(max(por_pagina, 1), MAX_POR_PAGINA)
    pagina = max(pagina, 1)

    filtros = []
    if activo is not None:
        filtros.append(Empleado.activo.is_(activo))
    # Un área que queda vacía al normalizar ("" o solo espacios) equivale a NO
    # filtrar, igual que el frontend, que omite el parámetro cuando queda vacío.
    area_normalizada = _normalizar_para_comparacion(area)
    if area_normalizada:
        filtros.append(_area_normalizada_sql() == area_normalizada)
    # Búsqueda q: igual simetría de normalización, pero PARCIAL sobre nombre
    # y puesto. Un q vacío al normalizar equivale a NO buscar.
    busqueda = _normalizar_para_comparacion(q)
    if busqueda:
        patron = f"%{busqueda}%"
        filtros.append(
            or_(
                _columna_normalizada(Empleado.nombre).like(patron),
                _columna_normalizada(Empleado.puesto).like(patron),
            )
        )

    consulta = select(Empleado).options(joinedload(Empleado.cuenta))
    if filtros:
        consulta = consulta.where(*filtros)
    total = db.scalar(
        select(func.count()).select_from(Empleado).where(*filtros) if filtros
        else select(func.count()).select_from(Empleado)
    )
    empleados = db.scalars(
        consulta.order_by(Empleado.id)
        .offset((pagina - 1) * por_pagina)
        .limit(por_pagina)
    ).unique().all()
    return list(empleados), int(total or 0)


def actualizar_empleado(
    db: Session, empleado: Empleado, datos: EmpleadoUpdateIn
) -> Empleado:
    """Actualiza datos administrativos del empleado (nombre/puesto/área/ingreso)."""
    cambios = datos.model_dump(exclude_unset=True)
    if not cambios:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Debe proporcionar al menos un campo a actualizar.",
        )
    for campo, valor in cambios.items():
        setattr(empleado, campo, valor)
    db.commit()
    db.refresh(empleado)
    return empleado


def cambiar_activo(db: Session, empleado: Empleado, activo: bool) -> Empleado:
    """Activa/desactiva SOLO el estado del empleado.

    No modifica CuentaAcceso: ambos estados están separados y la relación
    entre ellos no está definida por los documentos. El login sigue
    exactamente las reglas implementadas en Fase 3.
    """
    empleado.activo = activo
    db.commit()
    db.refresh(empleado)
    return empleado
