"""Pruebas del seed idempotente de la cuenta RH inicial (ET §35).

La implementación vive en ``app.core.seed.seed_rh`` y su contrato es:

- credenciales EXCLUSIVAMENTE desde la configuración de entorno
  (``SEED_RH_EMAIL`` / ``SEED_RH_PASSWORD``), nunca hardcodeadas;
- la contraseña del seed debe cumplir la política del PRD §3.5;
- aborta (``SystemExit``) si faltan las variables o la política no se cumple;
- idempotente: si la cuenta ya existe, no hace nada;
- la cuenta se crea ``RH``, activa, sin ``must_change_password`` y con un
  hash bcrypt verificable (ET §4.2).

La configuración se inyecta sustituyendo ``app.core.config.get_settings``
(la propia función importa ``get_settings`` en tiempo de llamada), sin
tocar el ``lru_cache`` global.
"""

from types import SimpleNamespace

import pytest
from sqlalchemy import select

import app.core.config as config
from app.core.seed import seed_rh
from app.core.security import verificar_password
from app.models.cuenta_acceso import CuentaAcceso

# Cumple PRD §3.5 (>= 8 caracteres y al menos un número).
PASSWORD_VALIDA = "Semilla2026"


def _configurar_seed(monkeypatch, email: str, password: str) -> None:
    """Sustituye la configuración que lee ``seed_rh`` en tiempo de llamada."""
    ajustes = SimpleNamespace(SEED_RH_EMAIL=email, SEED_RH_PASSWORD=password)
    monkeypatch.setattr(config, "get_settings", lambda: ajustes)


def _cuentas(db) -> list[CuentaAcceso]:
    return list(db.scalars(select(CuentaAcceso)).all())


class TestCreacion:
    def test_crea_la_cuenta_rh_cuando_no_existe(self, db, monkeypatch):
        _configurar_seed(
            monkeypatch, email="rh.inicial@empresa.dev", password=PASSWORD_VALIDA
        )

        assert seed_rh(db) is True

        (cuenta,) = _cuentas(db)
        assert cuenta.rol == "RH"
        assert cuenta.email == "rh.inicial@empresa.dev"
        assert cuenta.activo is True
        assert cuenta.must_change_password is False
        assert cuenta.empleado_id is None  # RH existe sin empleado (ET §4.1)
        assert verificar_password(PASSWORD_VALIDA, cuenta.password_hash)

    def test_normaliza_el_correo_a_minusculas_sin_espacios(self, db, monkeypatch):
        _configurar_seed(
            monkeypatch, email="  RH.Inicial@EMPRESA.dev  ", password=PASSWORD_VALIDA
        )

        assert seed_rh(db) is True

        (cuenta,) = _cuentas(db)
        assert cuenta.email == "rh.inicial@empresa.dev"


class TestIdempotencia:
    def test_si_la_cuenta_ya_existe_no_hace_nada(self, db, monkeypatch):
        _configurar_seed(monkeypatch, email="rh@empresa.dev", password=PASSWORD_VALIDA)

        assert seed_rh(db) is True
        assert seed_rh(db) is False  # segunda ejecución: nada que hacer

        assert len(_cuentas(db)) == 1


class TestBarreras:
    def test_aborta_si_faltan_las_variables(self, db, monkeypatch):
        for email, password in (("", PASSWORD_VALIDA), ("rh@empresa.dev", "")):
            _configurar_seed(monkeypatch, email=email, password=password)

            with pytest.raises(SystemExit) as excinfo:
                seed_rh(db)

            assert excinfo.value.code == 1
            assert _cuentas(db) == []  # nunca queda una cuenta a medias

    def test_aborta_si_la_password_viola_la_politica(self, db, monkeypatch):
        # "SinNumeros" no tiene dígitos; "c1corta" no llega a 8 caracteres.
        for invalida in ("SinNumeros", "c1corta"):
            _configurar_seed(monkeypatch, email="rh@empresa.dev", password=invalida)

            with pytest.raises(SystemExit) as excinfo:
                seed_rh(db)

            assert excinfo.value.code == 1
            assert _cuentas(db) == []
