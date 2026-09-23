"""Tests de gestión de empleados por RH (Fase 4A)."""

import pytest

from tests.helpers import (
    PASSWORD_PRUEBA,
    URL_LOGIN,
    URL_RH_EMPLEADOS,
    cabecera,
    extraer_de_log,
    login_y_token,
)

ALTA = {
    "nombre": "Empleado Nuevo",
    "email": "nuevo@empresa.dev",
    "puesto": "Desarrollador",
    "area": "TI",
    "fecha_ingreso": "2026-01-15",
}


@pytest.fixture()
def token_rh(client, cuenta_rh):
    return login_y_token(client, "rh@empresa.dev")


@pytest.fixture()
def token_empleado(client, cuenta_empleado):
    return login_y_token(client, "empleado@empresa.dev")


class TestCrearEmpleado:
    def test_crear_como_rh(self, client, token_rh):
        respuesta = client.post(URL_RH_EMPLEADOS, json=ALTA, headers=cabecera(token_rh))
        assert respuesta.status_code == 201, respuesta.text
        datos = respuesta.json()
        assert datos["nombre"] == "Empleado Nuevo"
        assert datos["activo"] is True
        # El email vive SOLO en CuentaAcceso (se lee desde la cuenta).
        assert datos["cuenta"]["email"] == "nuevo@empresa.dev"
        assert datos["cuenta"]["rol"] == "EMPLEADO"
        # Credencial temporal: debe cambiarla en el primer acceso (§4.2).
        assert datos["cuenta"]["must_change_password"] is True
        # NUNCA se exponen credenciales en la respuesta API.
        texto = respuesta.text.lower()
        assert "password_hash" not in texto
        assert "credencial" not in texto
        assert "temporal" not in texto

    def test_cuenta_nueva_usa_credencial_temporal(self, client, token_rh, caplog):
        """La credencial temporal funciona para el primer login."""
        assert client.post(
            URL_RH_EMPLEADOS, json=ALTA, headers=cabecera(token_rh)
        ).status_code == 201
        credencial = extraer_de_log(caplog, "Credencial temporal")
        login = client.post(
            URL_LOGIN, json={"email": "nuevo@empresa.dev", "password": credencial}
        )
        assert login.status_code == 200
        assert login.json()["must_change_password"] is True

    def test_email_duplicado_rechazado_case_insensitive(self, client, token_rh):
        assert client.post(
            URL_RH_EMPLEADOS, json=ALTA, headers=cabecera(token_rh)
        ).status_code == 201
        duplicado = dict(ALTA, email="  NUEVO@Empresa.DEV ")
        assert client.post(
            URL_RH_EMPLEADOS, json=duplicado, headers=cabecera(token_rh)
        ).status_code == 409

    def test_empleado_no_puede_crear(self, client, token_empleado):
        respuesta = client.post(
            URL_RH_EMPLEADOS, json=ALTA, headers=cabecera(token_empleado)
        )
        assert respuesta.status_code == 403

    def test_sin_token_rechazado(self, client):
        assert client.post(URL_RH_EMPLEADOS, json=ALTA).status_code == 401


class TestListarYPaginacion:
    @pytest.fixture(autouse=True)
    def _tres_empleados(self, db):
        from tests.helpers import crear_cuenta, crear_empleado

        for indice in range(3):
            empleado = crear_empleado(db, nombre=f"Empleado {indice}")
            crear_cuenta(
                db, rol="EMPLEADO", email=f"emp{indice}@empresa.dev", empleado=empleado
            )

    def test_listar_paginado(self, client, token_rh):
        pagina1 = client.get(
            f"{URL_RH_EMPLEADOS}?por_pagina=2", headers=cabecera(token_rh)
        )
        assert pagina1.status_code == 200
        datos = pagina1.json()
        assert datos["total"] == 3
        assert len(datos["items"]) == 2
        assert datos["pagina"] == 1

        pagina2 = client.get(
            f"{URL_RH_EMPLEADOS}?por_pagina=2&pagina=2", headers=cabecera(token_rh)
        )
        assert len(pagina2.json()["items"]) == 1

    def test_filtro_activo(self, client, token_rh, db):
        from app.models.empleado import Empleado

        db.get(Empleado, 1).activo = False
        db.commit()

        inactivos = client.get(
            f"{URL_RH_EMPLEADOS}?activo=false", headers=cabecera(token_rh)
        ).json()
        assert inactivos["total"] == 1
        assert inactivos["items"][0]["activo"] is False

    def test_empleado_no_puede_listar(self, client, token_empleado):
        assert client.get(
            URL_RH_EMPLEADOS, headers=cabecera(token_empleado)
        ).status_code == 403


class TestConsultarYModificar:
    def _empleado_id(self, db) -> int:
        from tests.helpers import crear_cuenta, crear_empleado

        empleado = crear_empleado(db, nombre="Consultable")
        crear_cuenta(
            db, rol="EMPLEADO", email="consultable@empresa.dev", empleado=empleado
        )
        return empleado.id

    def test_consultar(self, client, token_rh, db):
        empleado_id = self._empleado_id(db)
        respuesta = client.get(
            f"{URL_RH_EMPLEADOS}/{empleado_id}", headers=cabecera(token_rh)
        )
        assert respuesta.status_code == 200
        assert respuesta.json()["cuenta"]["email"] == "consultable@empresa.dev"

    def test_consultar_inexistente_404(self, client, token_rh):
        assert client.get(
            f"{URL_RH_EMPLEADOS}/9999", headers=cabecera(token_rh)
        ).status_code == 404

    def test_modificar_datos_administrativos(self, client, token_rh, db):
        empleado_id = self._empleado_id(db)
        respuesta = client.patch(
            f"{URL_RH_EMPLEADOS}/{empleado_id}",
            json={"puesto": "Senior Dev", "area": "Datos"},
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 200
        assert respuesta.json()["puesto"] == "Senior Dev"
        assert respuesta.json()["area"] == "Datos"

    def test_modificar_cuerpo_vacio_rechazado(self, client, token_rh, db):
        empleado_id = self._empleado_id(db)
        assert client.patch(
            f"{URL_RH_EMPLEADOS}/{empleado_id}", json={},
            headers=cabecera(token_rh),
        ).status_code == 422


class TestActivarDesactivar:
    def test_desactivar_empleado_no_toca_la_cuenta(self, client, token_rh, db):
        """Estados separados: Empleado.activo=false NO desactiva CuentaAcceso."""
        from sqlalchemy import select

        from app.models.cuenta_acceso import CuentaAcceso
        from tests.helpers import crear_cuenta, crear_empleado

        empleado = crear_empleado(db, nombre="Desactivable")
        crear_cuenta(
            db, rol="EMPLEADO", email="desactivable@empresa.dev", empleado=empleado
        )

        respuesta = client.patch(
            f"{URL_RH_EMPLEADOS}/{empleado.id}/estado",
            json={"activo": False},
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 200
        assert respuesta.json()["activo"] is False

        cuenta = db.scalar(
            select(CuentaAcceso).where(CuentaAcceso.empleado_id == empleado.id)
        )
        assert cuenta.activo is True  # separación de estados
        # El login sigue las reglas de Fase 3 (cuenta activa → login válido).
        assert client.post(
            URL_LOGIN,
            json={"email": "desactivable@empresa.dev", "password": PASSWORD_PRUEBA},
        ).status_code == 200

    def test_reactivar(self, client, token_rh, db):
        from tests.helpers import crear_cuenta, crear_empleado

        empleado = crear_empleado(db, nombre="Reactivable")
        empleado.activo = False
        db.commit()
        crear_cuenta(
            db, rol="EMPLEADO", email="reactivable@empresa.dev", empleado=empleado
        )

        respuesta = client.patch(
            f"{URL_RH_EMPLEADOS}/{empleado.id}/estado",
            json={"activo": True},
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 200
        assert respuesta.json()["activo"] is True


class TestIDORBasico:
    """Un Empleado no puede gestionar empleados ni editar con IDs arbitrarios."""

    @pytest.mark.parametrize(
        "metodo,ruta",
        [
            ("GET", URL_RH_EMPLEADOS),
            ("GET", f"{URL_RH_EMPLEADOS}/1"),
            ("POST", URL_RH_EMPLEADOS),
            ("PATCH", f"{URL_RH_EMPLEADOS}/1"),
            ("PATCH", f"{URL_RH_EMPLEADOS}/1/estado"),
        ],
    )
    def test_empleado_rechazado_en_rutas_rh(
        self, client, token_empleado, metodo, ruta
    ):
        cuerpo = {"nombre": "x", "email": "x@empresa.dev", "activo": True}
        # httpx no acepta json en GET; solo se envía cuerpo en los demás métodos.
        kwargs = {} if metodo == "GET" else {"json": cuerpo}
        respuesta = getattr(client, metodo.lower())(
            ruta, headers=cabecera(token_empleado), **kwargs
        )
        assert respuesta.status_code == 403

    def test_sin_token_rechazado(self, client):
        assert client.get(URL_RH_EMPLEADOS).status_code == 401
