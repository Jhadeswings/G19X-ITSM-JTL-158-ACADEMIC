"""Tests de hash y política de contraseñas (Fase 3, requisito 9)."""

from app.core.security import (
    hash_password,
    validar_politica_password,
    verificar_password,
)
from tests.helpers import URL_RESET


class TestHashYVerificacion:
    def test_password_valida_se_hashea_y_verifica(self):
        """El hash nunca es texto plano y la contraseña correcta verifica."""
        original = "Segura123"
        hash_resultado = hash_password(original)

        assert hash_resultado != original
        assert hash_resultado.startswith("$2")  # formato bcrypt
        assert verificar_password(original, hash_resultado)

    def test_password_invalida_no_verifica(self):
        """Una contraseña distinta no pasa la verificación."""
        hash_resultado = hash_password("Segura123")
        assert verificar_password("Incorrecta9", hash_resultado) is False

    def test_hash_unico_por_sal(self):
        """Dos hashes de la misma contraseña difieren (sal aleatoria)."""
        assert hash_password("Segura123") != hash_password("Segura123")

    def test_hash_malformado_no_reventar(self):
        assert verificar_password("Segura123", "no-es-un-hash") is False


class TestPoliticaPassword:
    """Política PRD §3.5: mínimo 8 caracteres y al menos un número."""

    def test_acepta_password_valida(self):
        assert validar_politica_password("Clave1234") == []

    def test_rechaza_demasiado_corta(self):
        errores = validar_politica_password("abc12")
        assert errores != []

    def test_rechaza_sin_numero(self):
        errores = validar_politica_password("sinnumeros")
        assert errores != []

    def test_rechaza_vacia(self):
        errores = validar_politica_password("")
        assert len(errores) == 2  # falla ambas reglas


class TestPoliticaEnAPI:
    def test_endpoint_rechaza_password_fuera_de_politica(self, client):
        """La política se aplica en backend (no depende del frontend)."""
        respuesta = client.post(
            URL_RESET, json={"token": "cualquiera", "password_nueva": "corta1"}
        )
        assert respuesta.status_code == 422

    def test_endpoint_rechaza_password_sin_numero(self, client):
        respuesta = client.post(
            URL_RESET, json={"token": "cualquiera", "password_nueva": "sinnumeros"}
        )
        assert respuesta.status_code == 422
