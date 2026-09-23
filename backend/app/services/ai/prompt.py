"""Prompt de interpretación de búsqueda (Especificación §27.1).

El prompt contiene EXCLUSIVAMENTE lo que la especificación permite enviar
al proveedor LLM:
- el texto de intención de RH (``query_text``);
- el catálogo cerrado de competencias soportadas;
- las reglas soportadas para ``min_level``;
- los campos de filtro permitidos.

NUNCA incluye: nombres de empleados, correos, IDs, entregables, texto
libre de participaciones, ``resolvio_problema``, resultados actuales,
evaluaciones, capacitaciones ni ningún contexto de la base de datos.

El prompt NO es un mecanismo de seguridad (regla explícita): el backend
valida la salida del modelo con Pydantic aunque el prompt diga la verdad.
"""

from app.schemas.resultado_actual import ClaveCompetencia

# Etiquetas legibles del catálogo cerrado (solo para el prompt).
_ETIQUETAS_COMPETENCIAS = {
    "desempeno_tecnico": "Desempeño técnico",
    "liderazgo": "Liderazgo",
    "trabajo_equipo": "Trabajo en equipo",
    "comunicacion": "Comunicación",
    "aprendizaje": "Capacidad de aprendizaje",
}

CATALOGO_COMPETENCIAS = "\n".join(
    f"- {codigo}: {etiqueta}" for codigo, etiqueta in _ETIQUETAS_COMPETENCIAS.items()
)

INSTRUCCIONES = f"""Eres un intérprete de intención de búsqueda de talento para RH.
Tu ÚNICA función es convertir el texto de RH en criterios estructurados.

Reglas obligatorias:
1. Usa EXCLUSIVAMENTE estas competencias soportadas (catálogo cerrado):
{CATALOGO_COMPETENCIAS}
2. "min_level" es un entero entre 1 y 5. El nivel estándar de alto potencial
   es 4: úsalo cuando el texto hable de nivel "fuerte", "alto" o "sólido"
   sin número. Si el texto menciona un número explícito de nivel, úsalo.
   NO inventes niveles distintos de lo que el texto expresa.
3. Los ÚNICOS campos permitidos en tu salida son: "competencies",
   "area" (texto o null) y "position" (texto o null). Nada más.
4. NO propongas personas, nombres, correos ni IDs de empleados.
5. NO generes campos como employee_id, candidate_names, winner,
   recommended_employee, talent_score ni reason_for_selection.
6. NO tomes decisiones de selección: solo estructuras criterios.
7. Si el texto no permite identificar al menos una competencia soportada,
   responde un JSON inválido a propósito (no inventes criterios).
8. Devuelve EXCLUSIVAMENTE un objeto JSON válido con esta forma exacta:
{{"competencies": [{{"code": "<competencia>", "min_level": <1-5>}}], "area": null, "position": null}}
"""


def construir_prompt(query_text: str) -> str:
    """Prompt final: instrucciones + texto de intención de RH. Nada más."""
    return f"{INSTRUCCIONES}\nTexto de RH:\n{query_text}"
