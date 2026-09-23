"""Adaptadores de proveedores LLM: Groq (primario) y Gemini (fallback).

Decisión (DECISIONES_TECNICAS.md §40): la Especificación Técnica v1.5 §1
declara LangChain como stack obligatorio (orquestación IA). Se incorpora
SOLO en la capa de transporte de cada proveedor mediante los paquetes de
integración (`langchain-core`, `langchain-groq`, `langchain-google-genai`;
NO `langchain` completo).

Lo que NO se delega a LangChain (permanece del proyecto, §27.3):
- el control explícito del fallback Groq → Gemini → error controlado
  (``AIOrchestrator``);
- la abstracción ``ProveedorLLM`` y la validación estricta de la salida
  (``validar_salida_proveedor`` + contrato Pydantic);
- el prompt mínimo (§27.1).

Contrato común: ``interpretar(prompt) -> str`` devuelve el TEXTO CRUDO
del modelo (se espera JSON). Cualquier problema de red/HTTP/API se
traduce a ``ErrorProveedor`` para que el orquestador pruebe el fallback.
El prompt ya es el objeto MÍNIMO permitido por §27.1: los adaptadores no
añaden contexto de empleados ni PII.
"""

from typing import Protocol

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_core.messages import BaseMessage

from app.services.ai.prompt import INSTRUCCIONES


class ErrorProveedor(Exception):
    """Fallo del proveedor (red, HTTP, API o respuesta ilegible)."""


class ProveedorLLM(Protocol):
    """Interfaz común de proveedores de interpretación."""

    nombre: str

    def interpretar(self, prompt: str) -> str:
        """Devuelve el texto crudo del modelo para el prompt dado."""
        ...  # pragma: no cover


def _texto_crudo(mensaje: BaseMessage) -> str:
    """Extrae el texto plano de la respuesta; rechaza salidas ilegibles."""
    contenido = mensaje.content
    if not isinstance(contenido, str) or not contenido.strip():
        raise ErrorProveedor("El proveedor devolvió una respuesta sin texto.")
    return contenido


class GroqProveedor:
    """Adaptador Groq (primario) vía ``langchain-groq``.

    Usa ``ChatGroq`` exclusivamente como transporte (misma API de chat
    completions con salida JSON). La elección de proveedor, el orden y
    el fallback NO los decide LangChain.
    """

    nombre = "groq"

    def __init__(self, api_key: str, modelo: str, timeout: float) -> None:
        if not api_key:
            raise ErrorProveedor("GROQ_API_KEY no configurada.")
        try:
            self._chat = ChatGroq(
                model=modelo,
                api_key=api_key,
                temperature=0,
                timeout=timeout,
                model_kwargs={"response_format": {"type": "json_object"}},
            )
        except Exception as error:  # construcción inválida = proveedor caído
            raise ErrorProveedor(f"Groq falló: {error}") from error

    def interpretar(self, prompt: str) -> str:
        try:
            respuesta = self._chat.invoke(
                [
                    ("system", INSTRUCCIONES),
                    ("human", prompt),
                ]
            )
            return _texto_crudo(respuesta)
        except ErrorProveedor:
            raise
        except Exception as error:
            raise ErrorProveedor(f"Groq falló: {error}") from error


class GeminiProveedor:
    """Adaptador Google Gemini (fallback) vía ``langchain-google-genai``.

    Usa ``ChatGoogleGenerativeAI`` solo como transporte con salida JSON
    (``response_mime_type``). Sin lógica de negocio propia.
    """

    nombre = "gemini"

    def __init__(self, api_key: str, modelo: str, timeout: float) -> None:
        if not api_key:
            raise ErrorProveedor("GEMINI_API_KEY no configurada.")
        try:
            self._chat = ChatGoogleGenerativeAI(
                model=modelo,
                api_key=api_key,
                temperature=0,
                timeout=timeout,
                response_mime_type="application/json",
            )
        except Exception as error:  # construcción inválida = proveedor caído
            raise ErrorProveedor(f"Gemini falló: {error}") from error

    def interpretar(self, prompt: str) -> str:
        try:
            respuesta = self._chat.invoke(
                [
                    ("system", INSTRUCCIONES),
                    ("human", prompt),
                ]
            )
            return _texto_crudo(respuesta)
        except ErrorProveedor:
            raise
        except Exception as error:
            raise ErrorProveedor(f"Gemini falló: {error}") from error
