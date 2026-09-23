"""Aplicación FastAPI.

Fase 3: incluye los endpoints reales de autenticación (``/api/v1/auth``) e
identidad (``/api/v1/me``). El resto de endpoints de negocio se agregarán
en fases posteriores según PRD v1.3 y Especificación Técnica v1.5.
"""

from fastapi import FastAPI

from app.api import (
    auth,
    me,
    me_capacitaciones,
    me_participaciones,
    me_proyectos,
    rh_empleados,
    rh_participaciones,
    rh_proyectos,
)
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    description="MVP local — PluriOne S.A. de C.V.",
    version="0.3.0",
)

app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(me.router, prefix=settings.API_V1_PREFIX)
app.include_router(rh_empleados.router, prefix=settings.API_V1_PREFIX)
app.include_router(rh_proyectos.router, prefix=settings.API_V1_PREFIX)
app.include_router(me_proyectos.router, prefix=settings.API_V1_PREFIX)
app.include_router(me_participaciones.router, prefix=settings.API_V1_PREFIX)
app.include_router(me_capacitaciones.router, prefix=settings.API_V1_PREFIX)
app.include_router(rh_participaciones.router, prefix=settings.API_V1_PREFIX)


@app.get("/health", tags=["infra"])
def health_check() -> dict:
    """Healthcheck básico para verificar que la API arranca."""
    return {"status": "ok"}

