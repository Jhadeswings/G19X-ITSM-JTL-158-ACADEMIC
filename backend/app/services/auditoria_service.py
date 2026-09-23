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

from sqlalchemy.orm import Session

from app.models.auditoria_modificacion import AuditoriaModificacion
from app.models.cuenta_acceso import CuentaAcceso

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
