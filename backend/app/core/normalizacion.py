"""Función canónica de normalización de nombres (Especificación Técnica §7).

Pasos (en este orden):
1. Unicode NFD.
2. eliminar diacríticos.
3. ``lower()``.
4. ``strip()``.
5. colapsar cualquier secuencia de espacios en un solo espacio.

Ejemplo canónico:
    "  Proyecto ÁRBOL  " → "proyecto arbol"

Esta es la ÚNICA implementación autorizada: debe usarse al crear, editar y
buscar proyectos, y en los tests. No duplicar esta lógica en otros lugares
(PRD §11.2 exige unicidad exacta tras esta normalización).
"""

import unicodedata


def normalizar_nombre(texto: str | None) -> str:
    """Normaliza un nombre para comparación y unicidad (§7)."""
    if not texto:
        return ""
    # 1. Unicode NFD (separa los diacríticos como marcas combinantes).
    descompuesto = unicodedata.normalize("NFD", texto)
    # 2. Eliminar diacríticos (categoría Unicode "Mark, nonspacing").
    sin_diacriticos = "".join(
        caracter
        for caracter in descompuesto
        if unicodedata.category(caracter) != "Mn"
    )
    # 3. lower()  4. strip()
    en_minusculas = sin_diacriticos.lower().strip()
    # 5. Colapsar espacios internos repetidos en uno solo.
    return " ".join(en_minusculas.split())
