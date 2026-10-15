"""Tests de GET /me/audits — historial de correcciones propias (Empleado).

Equivalente del Empleado de ``test_audits_rh.py`` (RH), acotado por
ownership (ET §32). Cubre: RBAC (401 sin token, 403 RH, 200 Empleado),
aislamiento entre dos empleados (uno NO ve las correcciones del otro),
contrato exacto (mismos campos que ``AuditoriaOut``, ni uno más), datos
disponibles tras una corrección real de RH, paginación, respuesta vacía,
rechazo de un ``empleado_id`` enviado por el cliente y que la CONSULTA no
genera ni altera auditorías (§25). Pruebas estrictamente aditivas: no tocan
las de ``test_audits_rh.py`` ni ``test_participaciones.py``.
"""

import pytest
from sqlalchemy import select

from app.core.fechas import fecha_negocio_hoy
from app.core.normalizacion import normalizar_nombre
from app.models.auditoria_modificacion import AuditoriaModificacion
from app.models.participacion import Participacion
from app.models.proyecto import Proyecto
from app.schemas.auditoria import AuditoriaOut
from tests.helpers import (
    URL_ME_AUDITS,
    URL_ME_PARTICIPACIONES,
    URL_RH_PARTICIPACIONES,
    cabecera,
    crear_cuenta,
    crear_empleado,
    login_y_token,
)


@pytest.fixture()
def token_rh(client, cuenta_rh):
    return login_y_token(client, "rh@empresa.dev")


@pytest.fixture()
def token_empleado(client, cuenta_empleado):
    return login_y_token(client, "empleado@empresa.dev")


@pytest.fixture()
def empleado_b(db):
    """Segundo empleado con su propia cuenta, para probar el aislamiento."""
    empleado = crear_empleado(db, nombre="Empleado B")
    crear_cuenta(db, rol="EMPLEADO", email="b@empresa.dev", empleado=empleado)
    return empleado


@pytest.fixture()
def token_empleado_b(client, empleado_b):
    return login_y_token(client, "b@empresa.dev")


def _proyecto(db, nombre: str) -> Proyecto:
    proyecto = Proyecto(
        nombre=nombre, nombre_normalizado=normalizar_nombre(nombre)
    )
    db.add(proyecto)
    db.flush()
    return proyecto


def _participacion(db, empleado_id: int, proyecto: Proyecto, *, horas=100):
    registro = Participacion(
        empleado_id=empleado_id,
        proyecto_id=proyecto.id,
        rol="Dev",
        horas=horas,
        fecha_registro=fecha_negocio_hoy(),
    )
    db.add(registro)
    db.commit()
    db.refresh(registro)
    return registro


def _corregir(client, token_rh, participacion_id, *, horas, motivo=None):
    cuerpo = {"horas": horas}
    if motivo is not None:
        cuerpo["motivo"] = motivo
    respuesta = client.patch(
        f"{URL_RH_PARTICIPACIONES}/{participacion_id}",
        json=cuerpo,
        headers=cabecera(token_rh),
    )
    assert respuesta.status_code == 200, respuesta.text


class TestAutorizacion:
    def test_sin_token_rechazado(self, client):
        assert client.get(URL_ME_AUDITS).status_code == 401

    def test_empleado_accede(self, client, token_empleado):
        respuesta = client.get(URL_ME_AUDITS, headers=cabecera(token_empleado))
        assert respuesta.status_code == 200, respuesta.text

    def test_rh_rechazado_403(self, client, token_rh):
        """La ruta propia del Empleado es exclusiva de Empleado (§31/§32)."""
        assert client.get(URL_ME_AUDITS, headers=cabecera(token_rh)).status_code == 403


class TestContrato:
    def test_pagina_con_contrato_exacto(self, client, token_empleado):
        datos = client.get(URL_ME_AUDITS, headers=cabecera(token_empleado)).json()
        assert set(datos) == {"total", "pagina", "por_pagina", "items"}
        assert datos["pagina"] == 1
        assert datos["por_pagina"] == 20
        assert datos["total"] == 0
        assert datos["items"] == []

    def test_item_con_campos_de_la_entidad(
        self, client, token_empleado, token_rh, db, cuenta_empleado
    ):
        proyecto = _proyecto(db, "Proyecto Contrato")
        registro = _participacion(db, cuenta_empleado.empleado_id, proyecto)
        _corregir(client, token_rh, registro.id, horas=120, motivo="Ajuste")

        datos = client.get(URL_ME_AUDITS, headers=cabecera(token_empleado)).json()
        assert len(datos["items"]) == 1
        # Los campos son los de AuditoriaOut (§25 + identificaciones de
        # presentación), ni uno más.
        assert set(datos["items"][0]) == set(AuditoriaOut.model_fields)

    def test_no_expone_credenciales(
        self, client, token_empleado, token_rh, db, cuenta_empleado
    ):
        proyecto = _proyecto(db, "Proyecto Credenciales")
        registro = _participacion(db, cuenta_empleado.empleado_id, proyecto)
        _corregir(client, token_rh, registro.id, horas=130)
        item = client.get(
            URL_ME_AUDITS, headers=cabecera(token_empleado)
        ).json()["items"][0]
        assert "password_hash" not in item
        # Identificación de presentación del actor, igual que en RH.
        assert item["actor_email"] == "rh@empresa.dev"


class TestAislamientoEntreEmpleados:
    def test_no_ve_correcciones_de_otro_empleado(
        self, client, token_empleado, token_empleado_b, token_rh, db,
        cuenta_empleado, empleado_b
    ):
        """Cada empleado ve SOLO las correcciones de SUS participaciones."""
        proyecto = _proyecto(db, "Proyecto Aislamiento")
        propia = _participacion(db, cuenta_empleado.empleado_id, proyecto)
        # Una participación del empleado B en el MISMO proyecto.
        otra = _participacion(db, empleado_b.id, proyecto)

        # RH corrige AMBAS participaciones.
        _corregir(client, token_rh, propia.id, horas=999, motivo="Corrección RH")
        _corregir(client, token_rh, otra.id, horas=888, motivo="Corrección RH")

        # El empleado A solo ve SU corrección.
        datos = client.get(URL_ME_AUDITS, headers=cabecera(token_empleado)).json()
        assert datos["total"] == 1
        assert datos["items"][0]["entidad_id"] == propia.id
        assert datos["items"][0]["proyecto_nombre"] == "Proyecto Aislamiento"

        # El empleado B solo ve SU corrección (nunca la del A).
        datos_b = client.get(
            URL_ME_AUDITS, headers=cabecera(token_empleado_b)
        ).json()
        assert datos_b["total"] == 1
        assert datos_b["items"][0]["entidad_id"] == otra.id

    def test_solo_las_propias_aparecen_en_el_listado(
        self, client, token_empleado, token_rh, db, cuenta_empleado
    ):
        proyecto = _proyecto(db, "Proyecto Solo Propias")
        propia = _participacion(db, cuenta_empleado.empleado_id, proyecto)
        otra = _participacion(
            db, crear_empleado(db, nombre="Otra Persona").id, proyecto
        )
        for participacion in (propia, otra):
            _corregir(client, token_rh, participacion.id, horas=111)
        datos = client.get(URL_ME_AUDITS, headers=cabecera(token_empleado)).json()
        ids = [item["entidad_id"] for item in datos["items"]]
        assert propia.id in ids
        assert otra.id not in ids
        assert datos["total"] == 1


class TestDatosDisponibles:
    def test_expone_todos_los_datos_historicos(
        self, client, token_empleado, token_rh, db, cuenta_empleado
    ):
        """Fecha, proyecto, registro, campo, valores, motivo y autor."""
        proyecto = _proyecto(db, "Proyecto Contexto")
        registro = _participacion(db, cuenta_empleado.empleado_id, proyecto)
        _corregir(client, token_rh, registro.id, horas=120, motivo="Ajuste de horas")
        item = client.get(
            URL_ME_AUDITS, headers=cabecera(token_empleado)
        ).json()["items"][0]
        assert item["entidad"] == "participacion"
        assert item["entidad_id"] == registro.id
        assert item["operacion"] == "CORRECCION"
        assert item["valores_anteriores"] == {"horas": 100}
        assert item["valores_nuevos"] == {"horas": 120}
        assert item["motivo"] == "Ajuste de horas"
        assert item["actor_email"] == "rh@empresa.dev"
        assert item["proyecto_nombre"] == "Proyecto Contexto"
        assert item["empleado_nombre"] == cuenta_empleado.empleado.nombre
        assert item["fecha"] is not None

    def test_motivo_opcional_puede_venir_vacio(
        self, client, token_empleado, token_rh, db, cuenta_empleado
    ):
        proyecto = _proyecto(db, "Proyecto Sin Motivo")
        registro = _participacion(db, cuenta_empleado.empleado_id, proyecto)
        _corregir(client, token_rh, registro.id, horas=90)
        item = client.get(
            URL_ME_AUDITS, headers=cabecera(token_empleado)
        ).json()["items"][0]
        assert item["motivo"] is None


class TestPaginacion:
    def test_ordena_y_pagina(
        self, client, token_empleado, token_rh, db, cuenta_empleado
    ):
        proyecto = _proyecto(db, "Proyecto Paginacion")
        registro = _participacion(db, cuenta_empleado.empleado_id, proyecto)
        # Tres correcciones consecutivas sobre la misma participación.
        for horas in (110, 120, 130):
            _corregir(client, token_rh, registro.id, horas=horas)

        pagina1 = client.get(
            f"{URL_ME_AUDITS}?pagina=1&por_pagina=2",
            headers=cabecera(token_empleado),
        ).json()
        assert pagina1["total"] == 3
        assert len(pagina1["items"]) == 2

        pagina2 = client.get(
            f"{URL_ME_AUDITS}?pagina=2&por_pagina=2",
            headers=cabecera(token_empleado),
        ).json()
        assert pagina2["total"] == 3
        assert len(pagina2["items"]) == 1
        # Sin solapamiento entre páginas.
        ids1 = {i["id"] for i in pagina1["items"]}
        ids2 = {i["id"] for i in pagina2["items"]}
        assert ids1.isdisjoint(ids2)

    def test_limites_invalidos_rechazados(self, client, token_empleado):
        assert (
            client.get(
                f"{URL_ME_AUDITS}?por_pagina=0", headers=cabecera(token_empleado)
            ).status_code
            == 422
        )
        assert (
            client.get(
                f"{URL_ME_AUDITS}?por_pagina=101", headers=cabecera(token_empleado)
            ).status_code
            == 422
        )


class TestSinIdentificadorDelCliente:
    def test_empleado_id_en_query_no_cambia_el_resultado(
        self, client, token_empleado, token_rh, db, cuenta_empleado
    ):
        """Anti-IDOR: el filtro SIEMPRE es el del token (§32)."""
        proyecto = _proyecto(db, "Proyecto Query")
        registro = _participacion(db, cuenta_empleado.empleado_id, proyecto)
        _corregir(client, token_rh, registro.id, horas=140)
        # Se intenta colar otro empleado_id por la URL.
        con_query = client.get(
            f"{URL_ME_AUDITS}?empleado_id=999999",
            headers=cabecera(token_empleado),
        )
        assert con_query.status_code == 200
        assert con_query.json()["total"] == 1
        assert con_query.json()["items"][0]["entidad_id"] == registro.id


class TestSoloLectura:
    def test_la_consulta_no_genera_ni_altera_auditorias(
        self, client, token_empleado, db
    ):
        antes = len(db.scalars(select(AuditoriaModificacion)).all())
        client.get(URL_ME_AUDITS, headers=cabecera(token_empleado))
        client.get(f"{URL_ME_AUDITS}?pagina=2", headers=cabecera(token_empleado))
        despues = len(db.scalars(select(AuditoriaModificacion)).all())
        assert despues == antes

    def test_respuesta_vacia_sin_correcciones(self, client, token_empleado):
        datos = client.get(URL_ME_AUDITS, headers=cabecera(token_empleado)).json()
        assert datos["total"] == 0
        assert datos["items"] == []


class TestModificacionesDelEmpleado:
    """El historial propio incluye MODIFICACION_EMPLEADO y CORRECCION (§25)."""

    def test_empleado_ve_su_propia_modificacion(
        self, client, token_empleado, db, cuenta_empleado
    ):
        proyecto = _proyecto(db, "Proyecto Modificacion")
        registro = _participacion(
            db, cuenta_empleado.empleado_id, proyecto, horas=100
        )
        respuesta = client.patch(
            f"{URL_ME_PARTICIPACIONES}/{registro.id}",
            json={"horas": 130},
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 200

        datos = client.get(URL_ME_AUDITS, headers=cabecera(token_empleado)).json()
        assert datos["total"] == 1
        item = datos["items"][0]
        assert item["operacion"] == "MODIFICACION_EMPLEADO"
        assert item["entidad_id"] == registro.id
        assert item["valores_anteriores"] == {"horas": 100}
        assert item["valores_nuevos"] == {"horas": 130}
        # El actor es el propio empleado, no RH.
        assert item["actor_email"] == "empleado@empresa.dev"

    def test_empleado_ve_modificacion_y_correccion_rh_juntas(
        self, client, token_empleado, token_rh, db, cuenta_empleado
    ):
        proyecto = _proyecto(db, "Proyecto Mixto")
        registro = _participacion(
            db, cuenta_empleado.empleado_id, proyecto, horas=100
        )
        # 1) El empleado modifica (MODIFICACION_EMPLEADO).
        client.patch(
            f"{URL_ME_PARTICIPACIONES}/{registro.id}",
            json={"horas": 110},
            headers=cabecera(token_empleado),
        )
        # 2) RH corrige (CORRECCION).
        _corregir(
            client, token_rh, registro.id, horas=200, motivo="Ajuste RH"
        )

        datos = client.get(URL_ME_AUDITS, headers=cabecera(token_empleado)).json()
        assert datos["total"] == 2
        operaciones = {i["operacion"] for i in datos["items"]}
        assert operaciones == {"MODIFICACION_EMPLEADO", "CORRECCION"}

    def test_modificacion_de_otro_empleado_no_aparece(
        self, client, token_empleado, token_empleado_b, token_rh, db,
        cuenta_empleado, empleado_b
    ):
        proyecto = _proyecto(db, "Proyecto Aislamiento Mod")
        propia = _participacion(db, cuenta_empleado.empleado_id, proyecto)
        ajena = _participacion(db, empleado_b.id, proyecto)
        # Cada quien modifica la suya.
        client.patch(
            f"{URL_ME_PARTICIPACIONES}/{propia.id}",
            json={"horas": 111},
            headers=cabecera(token_empleado),
        )
        client.patch(
            f"{URL_ME_PARTICIPACIONES}/{ajena.id}",
            json={"horas": 222},
            headers=cabecera(token_empleado_b),
        )
        datos = client.get(URL_ME_AUDITS, headers=cabecera(token_empleado)).json()
        assert datos["total"] == 1
        assert datos["items"][0]["entidad_id"] == propia.id
