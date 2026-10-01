"""Tests del contrato propio de ``GET /api/v1/me`` (MB-6-1, PRD §21.6).

Este microbloque amplía el DTO de ``/me`` con los dos datos laborales que
"Mi cuenta" debe mostrar y que antes no se exponían: ``puesto`` y ``area``. Los
campos ya existen en ``Empleado`` (ET §5); aquí NO se crean migraciones, NO se
duplican en ``CuentaAcceso`` (§4.1) y NO se añade ninguna vía de escritura.

Lo que estos tests fijan:

- el empleado autenticado ve SU nombre, SU puesto y SU área, y el resto del
  contrato existente no cambia;
- ``puesto``/``area`` nulos salen ``null`` (el modelo lo permite, §30
  ``profile_incomplete``): nunca se inventa un valor;
- una cuenta RH sin ``empleado_id`` sigue funcionando con los tres datos del
  empleado en ``null``;
- la identidad se deriva EXCLUSIVAMENTE del token (§32): ningún
  ``empleado_id`` del cliente cambia el resultado.
"""


import pytest

from tests.helpers import (
    URL_ME,
    cabecera,
    crear_cuenta,
    crear_empleado,
    login_y_token,
)

# Contrato completo y cerrado de `GET /me` tras MB-6-1. Si alguien añade o
# renombra un campo, este test falla: el DTO es un contrato, no un `dict`.
CAMPOS_ESPERADOS = {
    "cuenta_id",
    "email",
    "rol",
    "empleado_id",
    "empleado_nombre",
    "puesto",
    "area",
    "must_change_password",
}

# Campos que NUNCA deben salir: son internos o de credencial (ET §4/§4.2).
CAMPOS_PROHIBIDOS = {"password_hash", "activo"}


def _empleado_con_cuenta(db, nombre, puesto, area, email):
    empleado = crear_empleado(db, nombre=nombre, puesto=puesto, area=area)
    crear_cuenta(db, rol="EMPLEADO", email=email, empleado=empleado)
    return empleado


class TestEmpleadoConDatosLaborables:
    def test_expone_nombre_puesto_area_y_correo(self, client, db):
        _empleado_con_cuenta(
            db, "Ana López", "Analista de Datos", "Tecnología", "ana@empresa.dev"
        )
        token = login_y_token(client, "ana@empresa.dev")

        respuesta = client.get(URL_ME, headers=cabecera(token))

        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["empleado_nombre"] == "Ana López"
        assert datos["puesto"] == "Analista de Datos"
        assert datos["area"] == "Tecnología"
        assert datos["email"] == "ana@empresa.dev"

    def test_resto_del_contrato_existente_intacto(self, client, db):
        """MB-6-1 solo AÑADE campos: nada del contrato previo se altera."""
        _empleado_con_cuenta(
            db, "Ana López", "Analista de Datos", "Tecnología", "ana@empresa.dev"
        )
        token = login_y_token(client, "ana@empresa.dev")

        datos = client.get(URL_ME, headers=cabecera(token)).json()

        assert datos["rol"] == "EMPLEADO"
        assert datos["empleado_id"] is not None
        assert datos["must_change_password"] is False
        assert set(datos) == CAMPOS_ESPERADOS
        assert not (set(datos) & CAMPOS_PROHIBIDOS)

    def test_cuenta_id_corresponde_a_la_cuenta_autenticada(self, client, db):
        cuenta = crear_cuenta(db, rol="EMPLEADO", email="ana@empresa.dev")
        token = login_y_token(client, "ana@empresa.dev")

        datos = client.get(URL_ME, headers=cabecera(token)).json()

        assert datos["cuenta_id"] == cuenta.id


class TestPuestoYAreaNulos:
    """``Empleado`` admite ``puesto``/``area`` nulos (ET §5, §30): se respeta."""

    @pytest.mark.parametrize(
        ("puesto", "area"),
        [
            (None, None),
            ("Analista de Datos", None),
            (None, "Tecnología"),
        ],
    )
    def test_los_nulos_salen_null_sin_inventar_valores(
        self, client, db, puesto, area
    ):
        _empleado_con_cuenta(
            db, "Persona Sin Perfil", puesto, area, "perfil@empresa.dev"
        )
        token = login_y_token(client, "perfil@empresa.dev")

        respuesta = client.get(URL_ME, headers=cabecera(token))

        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["empleado_nombre"] == "Persona Sin Perfil"
        assert datos["puesto"] == puesto
        assert datos["area"] == area


class TestCuentaRhSinEmpleado:
    def test_rh_sigue_funcionando_con_los_tres_datos_en_null(
        self, client, cuenta_rh
    ):
        """Una cuenta RH puede existir sin empleado (§4.1): no debe romperse."""
        token = login_y_token(client, "rh@empresa.dev")

        respuesta = client.get(URL_ME, headers=cabecera(token))

        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["rol"] == "RH"
        assert datos["empleado_id"] is None
        assert datos["empleado_nombre"] is None
        assert datos["puesto"] is None
        assert datos["area"] is None
        assert datos["email"] == "rh@empresa.dev"
class TestIdentidadDerivadaDelToken:
    """§32: la identidad viene SIEMPRE de la cuenta autenticada."""

    def test_empleado_id_en_query_no_cambia_la_identidad(self, client, db):
        """Un ``empleado_id`` en la URL se IGNORA: no se acepta del cliente."""
        propio = _empleado_con_cuenta(
            db, "Ana López", "Analista", "Tecnología", "ana@empresa.dev"
        )
        otro = _empleado_con_cuenta(
            db, "Carlos Ruiz", "Director", "Operaciones", "carlos@empresa.dev"
        )
        token = login_y_token(client, "ana@empresa.dev")

        datos = client.get(
            f"{URL_ME}?empleado_id={otro.id}", headers=cabecera(token)
        ).json()

        assert datos["empleado_id"] == propio.id
        assert datos["empleado_nombre"] == "Ana López"
        assert datos["puesto"] == "Analista"
        assert datos["area"] == "Tecnología"

    def test_un_empleado_no_ve_los_datos_de_otro(self, client, db):
        _empleado_con_cuenta(
            db, "Ana López", "Analista", "Tecnología", "ana@empresa.dev"
        )
        _empleado_con_cuenta(
            db, "Carlos Ruiz", "Director", "Operaciones", "carlos@empresa.dev"
        )
        token = login_y_token(client, "ana@empresa.dev")

        datos = client.get(URL_ME, headers=cabecera(token)).json()

        assert "Carlos Ruiz" not in datos.values()
        assert "Director" not in datos.values()
        assert "Operaciones" not in datos.values()

    def test_get_no_admite_cuerpo_de_modificacion(self, client, db):
        """No hay vía de escritura: un body con ``empleado_id`` se descarta."""
        _empleado_con_cuenta(
            db, "Ana López", "Analista", "Tecnología", "ana@empresa.dev"
        )
        token = login_y_token(client, "ana@empresa.dev")

        respuesta = client.request(
            "GET",
            URL_ME,
            json={"empleado_id": 999, "puesto": "Inventado", "area": "Inventada"},
            headers=cabecera(token),
        )

        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["puesto"] == "Analista"
        assert datos["area"] == "Tecnología"