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
from app.models.participacion import Participacion
from app.schemas.auditoria import AuditoriaOut

# Operaciones canónicas.
OPERACION_CORRECCION = "CORRECCION"
# Modificación de la propia participación por el Empleado (ET §9.1/§25,
# ampliado): se diferencia de la corrección de RH por esta operación.
OPERACION_MODIFICACION_EMPLEADO = "MODIFICACION_EMPLEADO"

# Entidad con contexto empleado/proyecto resoluble.
ENTIDAD_PARTICIPACION = "participacion"


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
    _precargar_contexto_participaciones(db, registros)
    return list(registros), int(total or 0)


def _precargar_contexto_participaciones(
    db: Session, registros: list[AuditoriaModificacion]
) -> None:
    """Precarga empleado/proyecto de las participaciones auditadas (una query).

    Sin N+1: una sola consulta con ``joinedload`` para TODA la página, en
    vez de una por fila. El resultado se guarda en atributos efímeros
    (``_participacion``) sobre cada registro, sin tocar la BD ni el
    historial: solo lectura para presentación.
    """
    ids = {
        r.entidad_id
        for r in registros
        if r.entidad == ENTIDAD_PARTICIPACION and r.entidad_id is not None
    }
    if not ids:
        return
    participaciones = db.scalars(
        select(Participacion)
        .options(
            joinedload(Participacion.empleado),
            joinedload(Participacion.proyecto),
        )
        .where(Participacion.id.in_(ids))
    ).all()
    por_id = {p.id: p for p in participaciones}
    for registro in registros:
        if registro.entidad == ENTIDAD_PARTICIPACION:
            registro._participacion = por_id.get(registro.entidad_id)


def listar_auditorias_de_participaciones(
    db: Session,
    *,
    empleado_id: int,
    pagina: int = 1,
    por_pagina: int = 20,
) -> tuple[list[AuditoriaModificacion], int]:
    """Historial de correcciones de las participaciones PROPIAS (Empleado).

    Equivalente del Empleado de ``listar_auditorias`` (RH): la MISMA consulta
    de solo lectura, acotada por ownership (ET §32) con un JOIN a
    ``Participacion`` filtrado por ``empleado_id``. El ``empleado_id`` llega
    SIEMPRE del endpoint, que lo deriva de la cuenta autenticada; nunca del
    cliente.

    Aislamiento entre personas: solo se devuelven auditorías cuya
    ``entidad == "participacion"`` Y cuya participación pertenezca a
    ``empleado_id``. Las correcciones de RH sobre participaciones de OTROS
    empleados quedan fuera por construcción (el filtro vive en el JOIN, no en
    el cliente). Reutiliza ``_precargar_contexto_participaciones`` (una sola
    consulta de contexto por página, sin N+1) y ``a_auditoria_out`` (la misma
    presentación que RH: nunca expone credenciales).

    Participación inexistente — comportamiento DOCUMENTADO a propósito:
    ``AuditoriaModificacion`` guarda ``entidad_id`` pero NO ``empleado_id``; la
    pertenencia se resuelve UNIENDO con ``Participacion``. Si una participación
    auditada dejara de existir, no habría forma de demostrar a qué empleado
    pertenecía, por lo que la auditoría NO aparece en este historial. No se
    oculta en silencio: esos mismos registros siguen siendo visibles para RH en
    ``/rh/audits`` (con ``empleado_nombre``/``proyecto_nombre`` en ``None`` →
    «No disponible»). En la práctica actual las participaciones no se borran
    (no existe endpoint de borrado y las FKs usan ``ondelete=RESTRICT``).

    Solo lectura: no crea ni altera registros y no amplía qué operaciones
    generan auditoría (§25). Orden determinista: ``fecha`` DESC con ``id`` DESC
    como desempate —igual que RH—.
    """
    filtro = (
        AuditoriaModificacion.entidad == ENTIDAD_PARTICIPACION,
        Participacion.empleado_id == empleado_id,
    )
    total = db.scalar(
        select(func.count())
        .select_from(AuditoriaModificacion)
        .join(Participacion, AuditoriaModificacion.entidad_id == Participacion.id)
        .where(*filtro)
    )
    registros = db.scalars(
        select(AuditoriaModificacion)
        .join(Participacion, AuditoriaModificacion.entidad_id == Participacion.id)
        .where(*filtro)
        .order_by(
            AuditoriaModificacion.fecha.desc(), AuditoriaModificacion.id.desc()
        )
        .offset((pagina - 1) * por_pagina)
        .limit(por_pagina)
    ).all()
    _precargar_contexto_participaciones(db, registros)
    return list(registros), int(total or 0)


def a_auditoria_out(registro: AuditoriaModificacion) -> AuditoriaOut:
    """``AuditoriaOut`` con identificaciones de presentación.

    El correo proviene de la relación ``actor_cuenta`` y los nombres del
    registro auditado de la participación precargada (mismo patrón que
    ``a_participacion_out_con_empleado``): presentación pura, sin
    cálculos y sin credenciales. Si la participación ya no existe o la
    entidad no es una participación, ambos nombres quedan en ``None``.
    """
    salida = AuditoriaOut.model_validate(registro)
    cuenta = registro.actor_cuenta
    salida.actor_email = cuenta.email if cuenta is not None else None
    # Solo el contexto precargado en lote (``listar_auditorias``): fuera de
    # ahí no se resuelve nada perezoso para no generar N+1 accidentales.
    participacion = getattr(registro, "_participacion", None)
    empleado = getattr(participacion, "empleado", None)
    proyecto = getattr(participacion, "proyecto", None)
    salida.empleado_nombre = getattr(empleado, "nombre", None)
    salida.proyecto_nombre = getattr(proyecto, "nombre", None)
    return salida
