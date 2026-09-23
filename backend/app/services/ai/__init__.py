"""Adaptadores de IA (Fase 8: interpretación de búsqueda, Especificación §27).

Arquitectura testeable sin claves reales:
- ``proveedores``: adaptadores HTTP mínimos (Groq primario, Gemini fallback).
- ``ai_orchestrator``: orquestación Groq → Gemini con la MISMA validación
  Pydantic para ambos (§27.3).

Los adaptadores SOLO envían el prompt construido en ``prompt.py``
(query_text + catálogo cerrado + reglas): jamás contexto de empleados,
resultados actuales, evaluaciones, participaciones ni PII (§27.1).
"""
