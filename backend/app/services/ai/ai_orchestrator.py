"""AIOrchestrator: interpretación de búsqueda Groq → Gemini (§27.3).

Reglas implementadas:
- La IA SOLO interpreta intención: nunca calcula competencias, 9-Box, ni
  selecciona empleados (PRD §17.3). Este módulo no ejecuta búsquedas.
- La MISMA validación Pydantic (``CriteriosInterpretadosDTO``) se aplica
  a la salida de AMBOS proveedores (§27.3).
- Intento 1: Groq. Si falla (red, API o salida inválida): intento 2 Gemini.
- Si ambos fallan: error controlado (502). NUNCA se ejecuta una búsqueda
  inventada o parcialmente inferida (§27.3).
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
from app.services.ai.prompt import construir_prompt
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


def validar_salida_proveedor(crudo: str) -> CriteriosInterpretadosDTO:
    """Validación estricta y única para TODOS los proveedores (§27.2).

    Acepta exclusivamente un objeto JSON con los campos permitidos:
    cualquier campo prohibido (``employee_id``, ``winner``,
    ``candidate_names``, ``talent_score``, ``reason_for_selection``,
    ``recommended_employee``...) o valor inválido lanza ``ValueError``,
    que el orquestador trata como fallo del proveedor (→ fallback).
    """
    try:
        datos = json.loads(crudo)
    except (json.JSONDecodeError, TypeError) as error:
        raise ValueError("La salida del modelo no es JSON válido.") from error
    if not isinstance(datos, dict):
        raise ValueError("La salida del modelo no es un objeto JSON.")
    try:
        return CriteriosInterpretadosDTO.model_validate(datos)
    except ValidationError as error:
        raise ValueError(f"Salida del modelo fuera de contrato: {error}") from error


class AIOrchestrator:
    """Orquestador Groq → Gemini con validación común (§27)."""

    def __init__(self, proveedores: Sequence[ProveedorLLM]) -> None:
        self.proveedores = list(proveedores)

    def interpretar_busqueda(self, query_text: str) -> InterpretacionOut:
        """Interpreta la intención de RH; NO ejecuta ninguna búsqueda."""
        # §27.1: el prompt lleva SOLO query_text + catálogo + reglas.
        prompt = construir_prompt(query_text)

        for proveedor in self.proveedores:
            try:
                crudo = proveedor.interpretar(prompt)
                criterios = validar_salida_proveedor(crudo)  # misma validación
                return InterpretacionOut(
                    proveedor=proveedor.nombre, criterios=criterios
                )
            except (ErrorProveedor, ValueError):
                continue  # fallback al siguiente proveedor (§27.3)

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=MENSAJE_ERROR_CONTROLADO,
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
