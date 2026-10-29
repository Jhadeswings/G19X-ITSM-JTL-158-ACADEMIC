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
    # Obligatoria y SIN valor por defecto (igual que SECRET_KEY): la app no
    # arranca si falta (fail-fast). Se define en backend/.env fuera de Docker
    # o la fija docker-compose.yml dentro de la red de Compose (host "db").
    DATABASE_URL: str
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

    # ------------------------------------------------------------------
    # Correo (PRD §3.3/§3.4): proveedor SMTP configurable por entorno
    # (DECISIONES_TECNICAS §53). Sin SMTP_HOST o sin SMTP_FROM el
    # proveedor está "no configurado": el alta responde 503 sin crear la
    # cuenta (nunca queda una credencial sin entregar) y la recuperación
    # mantiene su 202 uniforme con registro de error interno. Las
    # credenciales del SMTP viven SOLO en el entorno, jamás en el código.
    # ------------------------------------------------------------------
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_STARTTLS: bool = True
    SMTP_TIMEOUT_SEGUNDOS: float = 10.0

    # ------------------------------------------------------------------
    # IA (Fase 8): interpretación de búsqueda con lenguaje natural
    # (Especificación §27). Groq primario, Gemini fallback. Opcionales:
    # sin claves, el endpoint de interpretación responde con el error
    # controlado y el resto del sistema funciona igual. Nunca versionar.
    # ------------------------------------------------------------------
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_TIMEOUT_SEGUNDOS: float = 20.0
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-flash"
    GEMINI_TIMEOUT_SEGUNDOS: float = 20.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
