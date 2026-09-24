"""AIOrchestrator: orquestación LLM Groq → Gemini (§27.3, §38).

Reglas implementadas:
- La IA SOLO interpreta intención o genera sugerencias de desarrollo:
  nunca calcula competencias, 9-Box, ni selecciona empleados (PRD §17.3).
  Este módulo no ejecuta búsquedas ni modifica resultados oficiales.
- La MISMA validación Pydantic se aplica a la salida de AMBOS proveedores
  por caso de uso: ``validar_salida_proveedor`` (búsqueda) y
  ``validar_salida_recomendacion`` (recomendaciones).
- Intento 1: Groq. Si falla (red, API o salida inválida): intento 2 Gemini.
- Si ambos fallan: error controlado (502). NUNCA se devuelve una salida
  inventada o parcialmente inferida (§27.3/§38).
- El prompt NO es mecanismo de seguridad: todo se valida en backend.
"""

import json
from typing import Sequence

from fastapi import HTTPException, status
from pydantic import ValidationError

from app.core.config import get_settings
from app.schemas.interpretacion_busqueda import (
    CriteriosInterpretadosDTO,
    InterpretacionOut,
)
from app.schemas.recomendacion_ia import SalidaRecomendacionIA
from app.services.ai.prompt import (
    construir_prompt,
    construir_prompt_recomendacion,
    INSTRUCCIONES_RECOMENDACION,
)
from app.services.ai.proveedores import (
    ErrorProveedor,
    GeminiProveedor,
    GroqProveedor,
    ProveedorLLM,
)

MENSAJE_ERROR_CONTROLADO = (
    "No fue posible interpretar la búsqueda con los proveedores de IA "
    "disponibles. Formule los criterios manualmente e inténtelo de nuevo."
)

MENSAJE_ERROR_RECOMENDACION = (
    "No fue posible generar la recomendación con los proveedores de IA "
    "disponibles. Inténtelo de nuevo más tarde."
)


def _validar_json_objeto(crudo: str) -> dict:
    """Parseo común: exclusivamente un objeto JSON válido."""
    try:
        datos = json.loads(crudo)
    except (json.JSONDecodeError, TypeError) as error:
        raise ValueError("La salida del modelo no es JSON válido.") from error
    if not isinstance(datos, dict):
        raise ValueError("La salida del modelo no es un objeto JSON.")
    return datos


def validar_salida_proveedor(crudo: str) -> CriteriosInterpretadosDTO:
    """Validación estricta y única de la búsqueda para TODOS los proveedores.

    Acepta exclusivamente un objeto JSON con los campos permitidos:
    cualquier campo prohibido (``employee_id``, ``winner``,
    ``candidate_names``, ``talent_score``, ``reason_for_selection``,
    ``recommended_employee``...) o valor inválido lanza ``ValueError``,
    que el orquestador trata como fallo del proveedor (→ fallback).
    """
    try:
        return CriteriosInterpretadosDTO.model_validate(_validar_json_objeto(crudo))
    except ValidationError as error:
        raise ValueError(f"Salida del modelo fuera de contrato: {error}") from error


def validar_salida_recomendacion(crudo: str) -> SalidaRecomendacionIA:
    """Validación estricta y única de recomendaciones (ET §37).

    Mismo tratamiento que la búsqueda: contrato cerrado
    (``SalidaRecomendacionIA``), cualquier campo prohibido o valor
    inválido ⇒ ``ValueError`` ⇒ fallo del proveedor (→ fallback).
    """
    try:
        return SalidaRecomendacionIA.model_validate(_validar_json_objeto(crudo))
    except ValidationError as error:
        raise ValueError(f"Salida del modelo fuera de contrato: {error}") from error


class AIOrchestrator:
    """Orquestador Groq → Gemini con validación común (§27/§38)."""

    def __init__(self, proveedores: Sequence[ProveedorLLM]) -> None:
        self.proveedores = list(proveedores)

    def _ejecutar_con_fallback(self, invocar, validar, mensaje_error: str):
        """Bucle común de fallback (§38): Groq → Gemini → 502 controlado.

        ``invocar(proveedor)`` devuelve el texto crudo del modelo (o lanza
        ``ErrorProveedor``); ``validar(crudo)`` devuelve el DTO validado (o
        lanza ``ValueError``). Sin proveedores configurados el resultado es
        el mismo error controlado: nunca se inventa una salida.
        """
        for proveedor in self.proveedores:
            try:
                return validar(invocar(proveedor)), proveedor.nombre
            except (ErrorProveedor, ValueError):
                continue  # fallback al siguiente proveedor (§27.3)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=mensaje_error,
        )

    def interpretar_busqueda(self, query_text: str) -> InterpretacionOut:
        """Interpreta la intención de RH; NO ejecuta ninguna búsqueda."""
        # §27.1: el prompt lleva SOLO query_text + catálogo + reglas.
        prompt = construir_prompt(query_text)

        criterios, nombre = self._ejecutar_con_fallback(
            lambda proveedor: proveedor.interpretar(prompt),
            validar_salida_proveedor,
            MENSAJE_ERROR_CONTROLADO,
        )
        return InterpretacionOut(proveedor=nombre, criterios=criterios)

    def generar_recomendacion(self, contexto: dict) -> tuple[SalidaRecomendacionIA, str]:
        """Genera una sugerencia de desarrollo a partir del contexto mínimo.

        ``contexto`` llega depurado por el servicio (PRD §18): sin nombres,
        correos, IDs, ``resolvio_problema`` ni datos de otros empleados.
        Devuelve ``(salida_validada, nombre_proveedor)`` para que el
        servicio componga la respuesta con procedencia explícita.
        """
        prompt = construir_prompt_recomendacion(contexto)

        return self._ejecutar_con_fallback(
            lambda proveedor: proveedor.generar(INSTRUCCIONES_RECOMENDACION, prompt),
            validar_salida_recomendacion,
            MENSAJE_ERROR_RECOMENDACION,
        )


def construir_orchestrator() -> AIOrchestrator:
    """Fábrica por defecto según configuración (claves opcionales).

    Sin claves configuradas el orquestador queda sin proveedores y el
    endpoint responde con el error controlado (502): la suite pasa sin
    claves reales y el comportamiento en producción solo requiere las
    variables de entorno.
    """
    settings = get_settings()
    proveedores: list[ProveedorLLM] = []
    if settings.GROQ_API_KEY:
        proveedores.append(
            GroqProveedor(
                settings.GROQ_API_KEY,
                settings.GROQ_MODEL,
                settings.GROQ_TIMEOUT_SEGUNDOS,
            )
        )
    if settings.GEMINI_API_KEY:
        proveedores.append(
            GeminiProveedor(
                settings.GEMINI_API_KEY,
                settings.GEMINI_MODEL,
                settings.GEMINI_TIMEOUT_SEGUNDOS,
            )
        )
    return AIOrchestrator(proveedores)
