"""Configuración central del backend.

Carga las variables de entorno (backend/.env) siguiendo la Especificación
Técnica v1.5. No incluir aquí claves de IA todavía: se agregarán en la fase
correspondiente (Groq primario, Gemini fallback vía LangChain).
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "Sistema de Identificación de Talento de Alto Potencial"
    API_V1_PREFIX: str = "/api/v1"
    DATABASE_URL: str = (
        "postgresql+psycopg2://talento:talento_local@localhost:5433/"
        "talento_alto_potencial"
    )
    # Zona horaria de negocio (Especificación Técnica §1)
    TZ: str = "America/Mexico_City"


@lru_cache
def get_settings() -> Settings:
    return Settings()
