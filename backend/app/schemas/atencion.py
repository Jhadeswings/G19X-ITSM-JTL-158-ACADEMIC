"""DTOs de Atención requerida (PRD §19.1, Especificación §30).

Vista DERIVADA, no una entidad persistente: NO existe tabla ni modelo
``Alert`` (PRD §2.2/§19.1, ET §30/§44). La consulta no modifica datos,
no altera competencias, 9-Box ni evaluaciones, y no genera auditoría.

Los motivos son CÓDIGOS ESTRUCTURADOS y neutrales (orientación
operativa, PRD §19.1): jamás lenguaje de "problema", "mal empleado",
"bajo desempeño" ni "alerta humana".
"""

from enum import Enum

from pydantic import BaseModel


class MotivoAtencion(str, Enum):
    """Motivos operativos cerrados por los que un empleado activo aparece."""

    PERFIL_INCOMPLETO = "PERFIL_INCOMPLETO"
    SIN_PARTICIPACION_RECIENTE = "SIN_PARTICIPACION_RECIENTE"


class EmpleadoAtencionOut(BaseModel):
    """Un empleado activo que requiere atención operativa."""

    empleado_id: int
    nombre: str
    motivos: list[MotivoAtencion]


class AtencionRequeridaOut(BaseModel):
    """Respuesta de ``AttentionService.get_required_attention()``.

    Orden determinista: nombre ascendente y, en empate, id ascendente
    (misma convención informativa que el resto de vistas derivadas).
    """

    total: int
    items: list[EmpleadoAtencionOut]