"""Servicio de gestión de empleados (Fase 4A).

Reglas de los documentos:
- RH registra: nombre, correo de acceso, puesto, área, fecha de ingreso
  (PRD §3.3).
- El correo vive SOLO en CuentaAcceso (§4.1): nunca se duplica en Empleado.
- La cuenta inicial de empleado usa credencial temporal y
  ``must_change_password = true`` (§4.2, PRD §3.3).
- Las credenciales NUNCA se exponen en respuestas API.
- ``Empleado.activo`` y ``CuentaAcceso.activo`` son estados SEPARADOS:
  desactivar un empleado NO modifica su cuenta (relación no definida por
  los documentos; ver DECISIONES_TECNICAS.md).
"""

import logging
import secrets

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.normalizacion import normalizar_nombre
from app.core.security import hash_password, validar_politica_password
from app.models.cuenta_acceso import CuentaAcceso
from app.models.empleado import Empleado
from app.schemas.empleado import EmpleadoCreateIn, EmpleadoUpdateIn
from app.services.auth_service import normalizar_email

logger = logging.getLogger(__name__)

MAX_POR_PAGINA = 100
POR_PAGINA_DEFECTO = 20


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


def _entregar_credencial_temporal(email: str, credencial: str) -> None:
    """Entrega de la credencial temporal (PRD §3.3: se envía al correo).

    SOLO DESARROLLO LOCAL: sin proveedor de correo definido, la credencial
    se escribe en el log del backend. NO es un mecanismo de envío para
    producción: cuando exista un proveedor real se sustituye exclusivamente
    esta función, sin tocar el resto del flujo (ver DECISIONES_TECNICAS.md).
    """
    logger.warning(
        "[SOLO DESARROLLO LOCAL] Credencial temporal para %s: %s "
        "(el primer acceso exigirá cambiarla)",
        email,
        credencial,
    )


def crear_empleado(db: Session, datos: EmpleadoCreateIn) -> Empleado:
    """Crea Empleado + CuentaAcceso en una sola transacción (PRD §3.3)."""
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
    db.commit()
    db.refresh(empleado)

    _entregar_credencial_temporal(email, credencial)
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
) -> tuple[list[Empleado], int]:
    """Lista paginada de empleados (§40: paginar listas RH, no cargar todo)."""
    por_pagina = min(max(por_pagina, 1), MAX_POR_PAGINA)
    pagina = max(pagina, 1)

    filtros = []
    if activo is not None:
        filtros.append(Empleado.activo.is_(activo))
    if area:
        filtros.append(func.lower(func.trim(Empleado.area)) == normalizar_nombre(area))

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
