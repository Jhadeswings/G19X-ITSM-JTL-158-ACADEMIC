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

    # ------------------------------------------------------------------
    # Seguridad / autenticación (Fase 3). Decisiones documentadas en
    # backend/DECISIONES_TECNICAS.md.
    # ------------------------------------------------------------------
    # Clave para firmar los JWT (HS256). Obligatoria y SIN valor por
    # defecto: la app no arranca si falta (fail-fast). Nunca versionarla.
    SECRET_KEY: str

    # Vida útil del JWT de acceso y de los tokens de recuperación.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    RESET_TOKEN_EXPIRE_MINUTES: int = 30

    # Coste de bcrypt. 12 es el estándar; los tests lo reducen para
    # acelerar la suite sin cambiar el valor de producción.
    BCRYPT_LOG_ROUNDS: int = 12

    # Credenciales del seed de RH inicial (Especificación Técnica §35).
    # Sin valores por defecto: si el seed corre sin ellas, aborta con
    # error explícito. Nunca hardcodear secretos reales.
    SEED_RH_EMAIL: str = ""
    SEED_RH_PASSWORD: str = ""

    # SOLO DESARROLLO LOCAL: registrar el token de recuperación en el log
    # del backend, dado que la documentación no define proveedor de correo.
    # NO es un mecanismo de envío para producción: allí debe sustituirse
    # por un proveedor real (ver backend/DECISIONES_TECNICAS.md).
    RECOVERY_TOKEN_DEV_LOG: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
