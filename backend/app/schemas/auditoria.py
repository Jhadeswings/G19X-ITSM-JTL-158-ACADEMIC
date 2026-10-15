"""Esquemas Pydantic de la consulta de auditoría para RH (Tarea C).

Contrato de LECTURA sobre la entidad mínima de Especificación Técnica §25:
``id``, ``actor_cuenta_id``, ``entidad``, ``entidad_id``, ``operacion``,
``valores_anteriores``/``valores_nuevos`` (JSONB nullable), ``motivo``
(opcional) y ``fecha``. No se inventan campos: el registro se expone tal
cual se persistió.

``actor_email`` es SOLO identificación de presentación del actor (PRD §22
«quién modificó»), siguiendo el precedente de ``empleado_nombre``/
``empleado_puesto`` de ``ParticipacionOut`` (RH-02.1): el frontend nunca
resuelve la identidad por su cuenta. Nunca se expone ``password_hash`` ni
ningún otro dato de credencial.

``empleado_nombre`` / ``proyecto_nombre`` son identificaciones de
presentación del registro auditado: cuando ``entidad == "participacion"``,
el nombre del empleado y del proyecto de esa participación, resueltos por
el backend con sus relaciones (sin N+1: una sola consulta por página).
Si la participación ya no existe o la entidad no es una participación,
llegan en ``None`` y el frontend muestra «No disponible»: nunca se
inventan nombres ni se asocian registros incorrectos.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditoriaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor_cuenta_id: int
    entidad: str
    entidad_id: int
    operacion: str
    valores_anteriores: dict | None = None
    valores_nuevos: dict | None = None
    motivo: str | None = None
    fecha: datetime
    # Identificación de presentación del actor; NO forma parte de §25.
    actor_email: str | None = None
    # Identificación de presentación del registro auditado (solo
    # participaciones); NO forma parte de §25. None = no disponible.
    empleado_nombre: str | None = None
    proyecto_nombre: str | None = None


class AuditoriaPageOut(BaseModel):
    """Página con el mismo contrato paginado del resto de listados RH."""

    total: int
    pagina: int
    por_pagina: int
    items: list[AuditoriaOut]
