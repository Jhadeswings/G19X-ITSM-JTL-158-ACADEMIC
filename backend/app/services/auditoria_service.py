"""Servicio reutilizable de auditoría de correcciones administrativas.

Especificación Técnica §25 y PRD §22:
- Obligatorio para correcciones RH sobre datos operativos relevantes,
  especialmente ``Participacion``.
- Debe permitir conocer: quién, qué entidad, qué registro, cuándo,
  operación y valores anteriores/posteriores.
- NO auditar resultados calculados dinámicamente.

Requisito transaccional: la auditoría ocurre DENTRO de la misma
transacción que la corrección. Este servicio nunca hace ``commit()``:
añade el registro a la sesión en curso y el commit lo realiza el servicio
que aplica la corrección (un solo flush/commit = atomicidad).
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models.auditoria_modificacion import AuditoriaModificacion
from app.models.cuenta_acceso import CuentaAcceso
from app.schemas.auditoria import AuditoriaOut

# Operaciones canónicas.
OPERACION_CORRECCION = "CORRECCION"


def registrar(
    db: Session,
    *,
    cuenta_actor: CuentaAcceso,
    entidad: str,
    entidad_id: int,
    operacion: str,
    valores_anteriores: dict | None,
    valores_nuevos: dict | None,
    motivo: str | None = None,
) -> AuditoriaModificacion:
    """Registra una auditoría en la transacción en curso (sin commit propio).

    ``valores_anteriores``/``valores_nuevos`` deben contener únicamente los
    campos objeto de la corrección, con sus valores previos y nuevos.
    """
    registro = AuditoriaModificacion(
        actor_cuenta_id=cuenta_actor.id,
        entidad=entidad,
        entidad_id=entidad_id,
        operacion=operacion,
        valores_anteriores=valores_anteriores,
        valores_nuevos=valores_nuevos,
        motivo=motivo,
    )
    db.add(registro)
    return registro


def listar_auditorias(
    db: Session, *, pagina: int = 1, por_pagina: int = 20
) -> tuple[list[AuditoriaModificacion], int]:
    """Listado paginado de auditorías para RH (Tarea C; PRD §22, ET §25).

    Consulta de SOLO LECTURA: no modifica datos, no crea registros y no
    amplía qué operaciones generan auditoría (§25). El orden es
    determinista: ``fecha`` DESC con ``id`` DESC como desempate —dos
    correcciones pueden compartir ``fecha`` y el desempate por ``id``
    garantiza el mismo orden en cada consulta—. El ``joinedload`` del actor
    evita el N+1 al presentar quién modificó.
    """
    total = db.scalar(select(func.count()).select_from(AuditoriaModificacion))
    registros = db.scalars(
        select(AuditoriaModificacion)
        .options(joinedload(AuditoriaModificacion.actor_cuenta))
        .order_by(
            AuditoriaModificacion.fecha.desc(), AuditoriaModificacion.id.desc()
        )
        .offset((pagina - 1) * por_pagina)
        .limit(por_pagina)
    ).all()
    return list(registros), int(total or 0)


def a_auditoria_out(registro: AuditoriaModificacion) -> AuditoriaOut:
    """``AuditoriaOut`` con la identificación de presentación del actor.

    El correo proviene de la relación ``actor_cuenta`` (contrato backend,
    mismo patrón que ``a_participacion_out_con_empleado``): presentación
    pura, sin cálculos y sin credenciales.
    """
    salida = AuditoriaOut.model_validate(registro)
    cuenta = registro.actor_cuenta
    salida.actor_email = cuenta.email if cuenta is not None else None
    return salida
