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

Contrato común: ``generar(system, prompt) -> str`` (y su caso particular
``interpretar(prompt)`` para búsqueda, §27.1) devuelve el TEXTO CRUDO
del modelo (se espera JSON). Cualquier problema de red/HTTP/API se
traduce a ``ErrorProveedor`` para que el orquestador pruebe el fallback.
Los prompts ya son el objeto MÍNIMO permitido: los adaptadores no
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
    """Interfaz común de proveedores de LLM.

    ``generar(system, prompt)`` es el método GENÉRICO de invocación con
    instrucciones de sistema propias de cada caso de uso. ``interpretar``
    se mantiene por compatibilidad con la interpretación de búsqueda
    (Fase 8): equivale a ``generar(INSTRUCCIONES, prompt)``.
    """

    nombre: str

    def generar(self, system: str, prompt: str) -> str:
        """Devuelve el texto crudo del modelo para system+prompt dados."""
        ...  # pragma: no cover

    def interpretar(self, prompt: str) -> str:
        """Caso particular de búsqueda: instrucciones §27.1 fijas."""
        ...  # pragma: no cover


def _segmentos_de_texto(partes: list) -> list[str]:
    """Segmentos de texto válidos de una lista de partes de contenido.

    Cada parte puede ser un dict ``{"type": "text", "text": ...}`` (formato
    de los adaptadores LangChain actuales con modelos de varias partes) o un
    objeto con atributo ``text``. Las partes que no aportan texto utilizable
    (otros ``type``, ``text`` ausente o vacío) se omiten de forma explícita:
    JAMÁS se fabrica texto que el proveedor no envió.
    """
    segmentos: list[str] = []
    for parte in partes:
        texto: str | None = None
        if isinstance(parte, dict):
            if parte.get("type") in (None, "text"):
                valor = parte.get("text")
                if isinstance(valor, str):
                    texto = valor
        else:
            valor = getattr(parte, "text", None)
            if isinstance(valor, str):
                texto = valor
        if texto is not None and texto.strip():
            segmentos.append(texto)
    return segmentos


def _texto_crudo(mensaje: BaseMessage) -> str:
    """Extrae el texto plano de la respuesta; rechaza salidas ilegibles.

    Acepta ``content`` como cadena (contrato clásico) o como LISTA de partes
    (el formato con el que los adaptadores LangChain actuales devuelven los
    modelos de varias partes). En ambos casos una respuesta sin texto
    utilizable — cadena vacía, lista vacía, partes sin texto o un tipo
    distinto — sigue siendo ``ErrorProveedor``: nada se convierte
    silenciosamente en una respuesta válida.
    """
    contenido = mensaje.content
    if isinstance(contenido, str):
        texto = contenido
    elif isinstance(contenido, list):
        texto = "".join(_segmentos_de_texto(contenido))
    else:
        raise ErrorProveedor("El proveedor devolvió una respuesta sin texto.")
    if not texto.strip():
        raise ErrorProveedor("El proveedor devolvió una respuesta sin texto.")
    return texto


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

    def generar(self, system: str, prompt: str) -> str:
        try:
            respuesta = self._chat.invoke(
                [
                    ("system", system),
                    ("human", prompt),
                ]
            )
            return _texto_crudo(respuesta)
        except ErrorProveedor:
            raise
        except Exception as error:
            raise ErrorProveedor(f"Groq falló: {error}") from error

    def interpretar(self, prompt: str) -> str:
        """Interpretación de búsqueda (§27.1): instrucciones fijas."""
        return self.generar(INSTRUCCIONES, prompt)


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

    def generar(self, system: str, prompt: str) -> str:
        try:
            respuesta = self._chat.invoke(
                [
                    ("system", system),
                    ("human", prompt),
                ]
            )
            return _texto_crudo(respuesta)
        except ErrorProveedor:
            raise
        except Exception as error:
            raise ErrorProveedor(f"Gemini falló: {error}") from error

    def interpretar(self, prompt: str) -> str:
        """Interpretación de búsqueda (§27.1): instrucciones fijas."""
        return self.generar(INSTRUCCIONES, prompt)
