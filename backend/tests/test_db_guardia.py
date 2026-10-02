"""Pruebas de la barrera de aislamiento de la base de datos.

CONTEXTO (MB-7-TEST-SAFETY)
---------------------------
Un ``pytest`` ejecutado por descuido hizo ``TRUNCATE`` sobre la base de
DESARROLLO y vació el proyecto. Estas pruebas son la red que demuestra
que la barrera de ``tests/db_guardia.py`` rechaza esa situación ANTES de
que pueda ejecutarse cualquier borrado.

Son pruebas PURAMENTE LÓGICAS (no abren conexión a la base): validan la
función que decide si una URL es válida para la suite. Por eso están
marcadas ``no_db``: no deben tocar ninguna base de datos, ni de pruebas ni
de desarrollo.
"""

import pytest

from tests.db_guardia import (
    BD_DESARROLLO,
    PREFIJO_BD_PRUEBAS,
    BaseDeDatosNoPermitida,
    construir_url_de_pruebas,
    es_base_de_pruebas,
    nombre_de_la_base,
    verificar_url_de_pruebas,
)

pytestmark = pytest.mark.no_db

# Credenciales ficticias: nunca valores reales.
URL_DESARROLLO = (
    "postgresql+psycopg2://usuario_falso:clave_falsa@localhost:5433/"
    + BD_DESARROLLO
)
URL_PRUEBAS = (
    "postgresql+psycopg2://usuario_falso:clave_falsa@localhost:5433/"
    + PREFIJO_BD_PRUEBAS
)


class TestRechazoDeBaseDeDesarrollo:
    """Lo que NO debe ocurrir nunca: truncar la base de desarrollo."""

    def test_rechaza_url_de_desarrollo(self):
        with pytest.raises(BaseDeDatosNoPermitida) as error:
            verificar_url_de_pruebas(URL_DESARROLLO)
        # El mensaje debe explicar el motivo y la consequence.
        assert "DESARROLLO" in str(error.value)
        assert "BORRA" in str(error.value)

    def test_rechaza_desarrollo_aunque_otro_host(self):
        """La base de desarrollo se rechaza por NOMBRE, no por host."""
        url = "postgresql://u:p@otro-host-inesperable:5432/" + BD_DESARROLLO
        with pytest.raises(BaseDeDatosNoPermitida):
            verificar_url_de_pruebas(url)

    def test_rechaza_desarrollo_en_otro_puerto(self):
        url = f"postgresql://u:p@localhost:99999/{BD_DESARROLLO}"
        with pytest.raises(BaseDeDatosNoPermitida):
            verificar_url_de_pruebas(url)

    def test_es_base_de_pruebas_es_falsa_para_desarrollo(self):
        assert not es_base_de_pruebas(BD_DESARROLLO)


class TestRechazoDeUrlsNoDemostrables:
    """Fail-closed: si no se puede PROBAR que es de pruebas, se rechaza."""

    @pytest.mark.parametrize(
        "url",
        [
            "",
            "   ",
            "postgresql://u:p@host:5432/",  # sin nombre de base
            "no-es-una-url",
        ],
        ids=["vacia", "espacios", "sin-dbname", "malformada"],
    )
    def test_rechaza_urls_no_utilizables(self, url):
        with pytest.raises(BaseDeDatosNoPermitida):
            verificar_url_de_pruebas(url)

    def test_rechaza_base_no_convenida(self):
        """Una base que no sigue la convención se rechaza."""
        with pytest.raises(BaseDeDatosNoPermitida):
            verificar_url_de_pruebas("postgresql://u:p@localhost:5432/postgres")

    def test_no_puede_usar_prefijo_solo_para_tropezar(self):
        """`talento_test` al inicio pero basura al final se rechaza."""
        # `talento_test...` con punto: no es un sufijo admitido.
        assert not es_base_de_pruebas(f"{PREFIJO_BD_PRUEBAS}.drop")


class TestAceptacionDeBaseDePruebas:
    def test_acepta_base_por_defecto(self):
        assert verificar_url_de_pruebas(URL_PRUEBAS) == PREFIJO_BD_PRUEBAS

    def test_acepta_base_con_sufijo_de_orden(self):
        """Varias bases de pruebas aisladas pueden convivir."""
        assert es_base_de_pruebas(f"{PREFIJO_BD_PRUEBAS}_mb72")
        assert es_base_de_pruebas(f"{PREFIJO_BD_PRUEBAS}_mb71")


class TestDerivacionAutomatica:
    """El usuario no debe recordar escribir la URL de pruebas."""

    def test_deriva_misma_conexion_con_otra_base(self):
        derivada = construir_url_de_pruebas(URL_DESARROLLO, PREFIJO_BD_PRUEBAS)
        assert nombre_de_la_base(derivada) == PREFIJO_BD_PRUEBAS

    def test_conserva_credenciales_host_y_puerto(self):
        derivada = construir_url_de_pruebas(URL_DESARROLLO, PREFIJO_BD_PRUEBAS)
        assert "usuario_falso" in derivada
        assert "clave_falsa" in derivada
        assert "localhost:5433" in derivada

    def test_no_incluye_la_base_de_desarrollo(self):
        derivada = construir_url_de_pruebas(URL_DESARROLLO, PREFIJO_BD_PRUEBAS)
        assert BD_DESARROLLO not in derivada

    def test_derivacion_desde_desarrollo_es_verificable(self):
        """La URL derivada debe superar la propia verificación."""
        derivada = construir_url_de_pruebas(URL_DESARROLLO, PREFIJO_BD_PRUEBAS)
        assert verificar_url_de_pruebas(derivada) == PREFIJO_BD_PRUEBAS