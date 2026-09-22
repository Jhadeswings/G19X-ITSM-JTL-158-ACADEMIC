"""Aplicación FastAPI — fase de scaffolding.

Solo contiene infraestructura de arranque. Los endpoints de negocio,
autenticación y servicios de dominio se agregarán en fases posteriores
según PRD v1.3 y Especificación Técnica v1.5.
"""

from fastapi import FastAPI

from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    description="MVP local — PluriOne S.A. de C.V. (scaffolding inicial)",
    version="0.1.0",
)


@app.get("/health", tags=["infra"])
def health_check() -> dict:
    """Healthcheck básico para verificar que la API arranca."""
    return {"status": "ok"}
