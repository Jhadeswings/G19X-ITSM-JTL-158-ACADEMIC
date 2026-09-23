"""Tests de la función canónica de normalización (§7, Fase 4A)."""

from app.core.normalizacion import normalizar_nombre


def test_ejemplo_canonico_del_documento():
    """Ejemplo exacto de la Especificación Técnica §7."""
    assert normalizar_nombre("  Proyecto ÁRBOL  ") == "proyecto arbol"


def test_elimina_diacriticos():
    assert normalizar_nombre("Café Añejo") == "cafe anejo"


def test_lower_y_strip():
    assert normalizar_nombre("  NOMBRE EN MAYÚSCULAS ") == "nombre en mayusculas"


def test_colapsa_espacios_internos():
    assert normalizar_nombre("a   b\t c") == "a b c"


def test_vacio_y_none():
    assert normalizar_nombre("") == ""
    assert normalizar_nombre("   ") == ""
    assert normalizar_nombre(None) == ""


def test_es_idempotente():
    once = normalizar_nombre("  Proyecto ÁRBOL  ")
    assert normalizar_nombre(once) == once
