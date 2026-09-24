"""Aplicación FastAPI.

Fase 6: incluye evaluaciones oficiales históricas (generación atómica y
lecturas read-only para RH; historial propio sin 9-Box para Empleado).
El resto de endpoints de negocio se agregarán en fases posteriores según
PRD v1.3 y Especificación Técnica v1.5.
"""

from fastapi import FastAPI

from app.api import (
    auth,
    me,
    me_capacitaciones,
    me_evaluations,
    me_participaciones,
    me_progress,
    me_proyectos,
    rh_attention,
    rh_comparison,
    rh_empleados,
    rh_evaluations,
    rh_gaps,
    rh_mentorship,
    rh_participaciones,
    rh_proyectos,
    rh_talent_search,
)
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    description="MVP local — PluriOne S.A. de C.V.",
    version="0.4.0",
)

app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(me.router, prefix=settings.API_V1_PREFIX)
app.include_router(rh_empleados.router, prefix=settings.API_V1_PREFIX)
app.include_router(rh_proyectos.router, prefix=settings.API_V1_PREFIX)
app.include_router(me_proyectos.router, prefix=settings.API_V1_PREFIX)
app.include_router(me_participaciones.router, prefix=settings.API_V1_PREFIX)
app.include_router(me_capacitaciones.router, prefix=settings.API_V1_PREFIX)
app.include_router(rh_participaciones.router, prefix=settings.API_V1_PREFIX)
app.include_router(rh_evaluations.router, prefix=settings.API_V1_PREFIX)
app.include_router(me_evaluations.router, prefix=settings.API_V1_PREFIX)
app.include_router(rh_talent_search.router, prefix=settings.API_V1_PREFIX)
app.include_router(rh_mentorship.router, prefix=settings.API_V1_PREFIX)
app.include_router(rh_gaps.router, prefix=settings.API_V1_PREFIX)
app.include_router(rh_attention.router, prefix=settings.API_V1_PREFIX)
app.include_router(rh_comparison.router, prefix=settings.API_V1_PREFIX)
app.include_router(me_progress.router, prefix=settings.API_V1_PREFIX)


@app.get("/health", tags=["infra"])
def health_check() -> dict:
    """Healthcheck básico para verificar que la API arranca."""
    return {"status": "ok"}

