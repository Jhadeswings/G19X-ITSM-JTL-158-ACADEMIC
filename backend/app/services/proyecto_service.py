"""Servicio de proyectos (Fase 4A).

Reglas de los documentos:
- Catálogo compartido por toda la organización (PRD §11).
- Solo el Empleado crea proyectos nuevos; siempre inician en EN_PROCESO
  (PRD §11.1, Especificación §6). RH administra proyectos EXISTENTES y no
  tiene endpoint de creación desde cero.
- ``nombre_normalizado`` se genera con la función canónica (§7) y es
  UNIQUE (§6.1): crear un duplicado exacto se evita con 409.
- Búsqueda: exacta por ``nombre_normalizado`` primero; si no hay exacta,
  sugerencias pg_trgm con similitud > 0.30, máximo 5 (§8).
- La coincidencia aproximada es INFORMATIVA (advertencia, no error):
  nunca impide crear un proyecto nuevo ni crea ninguna relación.
"""

from fastapi import HTTPException, status
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.normalizacion import normalizar_nombre
from app.models.participacion import Participacion
from app.models.proyecto import Proyecto
from app.schemas.proyecto import (
    ProyectoCreateIn,
    ProyectoOut,
    ProyectoUpdateIn,
    ResultadoBusquedaOut,
    SugerenciaOut,
)

# Umbral oficial de similitud para sugerencias (§8).
UMBRAL_SIMILITUD = 0.30
MAX_SUGERENCIAS = 5
MAX_POR_PAGINA = 100
POR_PAGINA_DEFECTO = 20

# Consulta pg_trgm: el operador ``%`` permite usar el índice GIN (§33) y el
# filtro ``similarity(...) > :umbral`` materializa la regla explícita del
# documento. Desempate determinista por nombre_normalizado.
_SQL_SUGERENCIAS = text(
    """
    SELECT p.id, p.nombre, p.nombre_normalizado, p.area, p.cliente, p.estado,
           p.created_at, p.updated_at,
           similarity(p.nombre_normalizado, :consulta) AS similitud
    FROM proyectos p
    WHERE p.nombre_normalizado % :consulta
      AND similarity(p.nombre_normalizado, :consulta) > :umbral
    ORDER BY similitud DESC, p.nombre_normalizado ASC
    LIMIT :limite
    """
)


def _normalizar_consulta(nombre: str) -> str:
    consulta = normalizar_nombre(nombre)
    if not consulta:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El nombre de búsqueda no puede estar vacío.",
        )
    return consulta


def crear_proyecto_empleado(db: Session, datos: ProyectoCreateIn) -> Proyecto:
    """Crea un proyecto nuevo (solo Empleado). Siempre inicia EN_PROCESO."""
    nombre_normalizado = _normalizar_consulta(datos.nombre)

    duplicado = db.scalar(
        select(Proyecto).where(Proyecto.nombre_normalizado == nombre_normalizado)
    )
    if duplicado is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un proyecto con ese nombre (coincidencia exacta).",
        )

    proyecto = Proyecto(
        nombre=datos.nombre,
        nombre_normalizado=nombre_normalizado,
        area=datos.area,
        cliente=datos.cliente,
        estado="EN_PROCESO",  # §6: inicio obligatorio
    )
    db.add(proyecto)
    db.commit()
    db.refresh(proyecto)
    return proyecto


def obtener_proyecto(db: Session, proyecto_id: int) -> Proyecto:
    proyecto = db.get(Proyecto, proyecto_id)
    if proyecto is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado."
        )
    return proyecto


def actualizar_proyecto_rh(
    db: Session, proyecto: Proyecto, datos: ProyectoUpdateIn
) -> Proyecto:
    """Edición administrativa por RH de un proyecto EXISTENTE."""
    cambios = datos.model_dump(exclude_unset=True)
    if not cambios:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Debe proporcionar al menos un campo a actualizar.",
        )

    if "nombre" in cambios:
        nombre_normalizado = _normalizar_consulta(cambios["nombre"])
        duplicado = db.scalar(
            select(Proyecto).where(
                Proyecto.nombre_normalizado == nombre_normalizado,
                Proyecto.id != proyecto.id,
            )
        )
        if duplicado is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe otro proyecto con ese nombre.",
            )
        proyecto.nombre_normalizado = nombre_normalizado

    for campo, valor in cambios.items():
        if campo != "nombre":
            setattr(proyecto, campo, valor)

    db.commit()
    db.refresh(proyecto)
    return proyecto


def listar_proyectos_propio_empleado(
    db: Session,
    *,
    empleado_id: int,
    pagina: int = 1,
    por_pagina: int = POR_PAGINA_DEFECTO,
) -> tuple[list[Proyecto], int]:
    """Lista paginada de los proyectos del catálogo en los que el empleado tiene
    participación (ET §31 ``GET /me/projects``, PRD §21.1).

    La pertenencia NO es un atributo del proyecto: el catálogo es compartido por
    toda la organización (PRD §11) y ``proyectos`` no tiene ``empleado_id``. La
    única relación real entre un empleado y un proyecto es ``participaciones``
    (FK ``proyecto_id``, ET §9), que además es UNIQUE por empleado/proyecto. Por
    tanto un proyecto es "del empleado" si y solo si existe su participación, y
    el JOIN por ``Participacion`` es exactamente lo que evita exponer proyectos
    ajenos (anti-IDOR, §32). No se añade ningún campo ni filtro nuevo: el
    proyecto NO aparece sin participación, porque no hay relación que lo
    justifique.

    ORDEN: ``proyectos.id`` descendente. No es una preferencia de esta función
    sino el orden de clave primaria de un catálogo sin columna de fecha
    propia, y da el mismo resultado que ``ORDER BY id DESC`` que ya usa el
    servicio para el catálogo completo. NO es "proyectos recientes": no se
    inventa ninguna noción de actividad reciente; si el orden se cambiara por
    fecha, tendría que ser una regla documentada del modelo, no de la vista.

    Reutiliza ``POR_PAGINA_DEFECTO``/``MAX_POR_PAGINA`` del mismo módulo, para
    que el paginado sea idéntico al del resto del catálogo.
    """
    por_pagina = min(max(por_pagina, 1), MAX_POR_PAGINA)
    pagina = max(pagina, 1)

    total = db.scalar(
        select(func.count())
        .select_from(Participacion)
        .where(Participacion.empleado_id == empleado_id)
    )
    proyectos = db.scalars(
        select(Proyecto)
        .join(Participacion, Participacion.proyecto_id == Proyecto.id)
        .where(Participacion.empleado_id == empleado_id)
        .order_by(Proyecto.id.desc())
        .offset((pagina - 1) * por_pagina)
        .limit(por_pagina)
    ).all()
    return list(proyectos), int(total or 0)


def listar_proyectos(
    db: Session,
    *,
    pagina: int = 1,
    por_pagina: int = POR_PAGINA_DEFECTO,
    estado: str | None = None,
    area: str | None = None,
) -> tuple[list[Proyecto], int]:
    """Lista paginada del catálogo de proyectos (§40)."""
    por_pagina = min(max(por_pagina, 1), MAX_POR_PAGINA)
    pagina = max(pagina, 1)

    filtros = []
    if estado:
        filtros.append(Proyecto.estado == estado)
    if area:
        filtros.append(func.lower(func.trim(Proyecto.area)) == normalizar_nombre(area))

    consulta = select(Proyecto)
    if filtros:
        consulta = consulta.where(*filtros)

    conteo = select(func.count()).select_from(Proyecto)
    if filtros:
        conteo = conteo.where(*filtros)
    total = db.scalar(conteo)

    proyectos = db.scalars(
        consulta.order_by(Proyecto.id)
        .offset((pagina - 1) * por_pagina)
        .limit(por_pagina)
    ).all()
    return list(proyectos), int(total or 0)


def buscar_proyectos(db: Session, nombre: str) -> ResultadoBusquedaOut:
    """Búsqueda obligatoria previa a crear un proyecto (PRD §11.1, §8).

    Flujo: normalización → comparación exacta por ``nombre_normalizado`` →
    si no hay exacta, sugerencias pg_trgm (> 0.30, máx 5).

    La sugerencia aproximada NUNCA sustituye a la verificación exacta y no
    crea ninguna relación con el proyecto (§8).
    """
    consulta = _normalizar_consulta(nombre)

    exacta = db.scalar(
        select(Proyecto).where(Proyecto.nombre_normalizado == consulta)
    )

    sugerencias: list[SugerenciaOut] = []
    if exacta is None:
        # Umbral explícito de sesión para que el operador % coincida con la
        # regla del documento (0.30).
        db.execute(
            text("SELECT set_config('pg_trgm.similarity_threshold', '0.3', true)")
        )
        filas = db.execute(
            _SQL_SUGERENCIAS,
            {
                "consulta": consulta,
                "umbral": UMBRAL_SIMILITUD,
                "limite": MAX_SUGERENCIAS,
            },
        ).mappings()
        sugerencias = [
            SugerenciaOut(
                proyecto=ProyectoOut.model_validate(fila),
                similitud=round(float(fila["similitud"]), 4),
            )
            for fila in filas
        ]

    return ResultadoBusquedaOut(
        consulta_normalizada=consulta,
        coincidencia_exacta=ProyectoOut.model_validate(exacta) if exacta else None,
        sugerencias=sugerencias,
    )
