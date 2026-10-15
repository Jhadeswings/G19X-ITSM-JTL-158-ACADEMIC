"""Tests de GET /rh/audits — consulta de auditoría para RH (Tarea C).

Cubre: autorización (401 sin token, 403 Empleado, 200 RH), contrato
exacto de la página y del registro (ET §25 + identificación de
presentación), límites de paginación, orden determinista (fecha DESC,
id DESC), la visibilidad de una corrección real y que la CONSULTA no
genera auditoría ni altera datos (§25). Pruebas estrictamente aditivas:
no tocan las de ``test_auditoria.py`` (escritura transaccional).
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models.auditoria_modificacion import AuditoriaModificacion
from app.schemas.auditoria import AuditoriaOut
from tests.helpers import (
    URL_RH_AUDITS,
    URL_RH_PARTICIPACIONES,
    cabecera,
    login_y_token,
)


@pytest.fixture()
def token_rh(client, cuenta_rh):
    return login_y_token(client, "rh@empresa.dev")


@pytest.fixture()
def token_empleado(client, cuenta_empleado):
    return login_y_token(client, "empleado@empresa.dev")


def sembrar_auditoria(db, cuenta, *, entidad_id: int, fecha, **campos):
    registro = AuditoriaModificacion(
        actor_cuenta_id=cuenta.id,
        entidad="participacion",
        entidad_id=entidad_id,
        operacion="CORRECCION",
        fecha=fecha,
        **campos,
    )
    db.add(registro)
    db.commit()
    db.refresh(registro)
    return registro


def contar_auditorias(db) -> int:
    return len(db.scalars(select(AuditoriaModificacion)).all())


class TestAutorizacion:
    def test_sin_token_rechazado(self, client):
        assert client.get(URL_RH_AUDITS).status_code == 401

    def test_empleado_rechazado(self, client, token_empleado):
        respuesta = client.get(URL_RH_AUDITS, headers=cabecera(token_empleado))
        assert respuesta.status_code == 403

    def test_rh_accede(self, client, token_rh):
        respuesta = client.get(URL_RH_AUDITS, headers=cabecera(token_rh))
        assert respuesta.status_code == 200, respuesta.text


class TestContrato:
    def test_pagina_con_contrato_exacto(self, client, token_rh):
        datos = client.get(URL_RH_AUDITS, headers=cabecera(token_rh)).json()
        assert set(datos) == {"total", "pagina", "por_pagina", "items"}
        assert datos["pagina"] == 1
        assert datos["por_pagina"] == 20
        assert datos["total"] == 0
        assert datos["items"] == []

    def test_item_con_campos_de_la_entidad(self, client, token_rh, cuenta_rh, db):
        sembrar_auditoria(
            db,
            cuenta_rh,
            entidad_id=7,
            fecha=datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc),
            valores_anteriores={"horas": 100},
            valores_nuevos={"horas": 150},
            motivo="Corrección solicitada",
        )
        datos = client.get(URL_RH_AUDITS, headers=cabecera(token_rh)).json()
        assert len(datos["items"]) == 1
        # Los campos son los de AuditoriaOut (§25 + identificaciones de
        # presentación), ni uno más.
        assert set(datos["items"][0]) == set(AuditoriaOut.model_fields)
        # Sin participación existente: contexto en None, nunca inventado.
        assert datos["items"][0]["empleado_nombre"] is None
        assert datos["items"][0]["proyecto_nombre"] is None

    def test_no_expone_credenciales(self, client, token_rh, cuenta_rh, db):
        """Nunca password_hash ni otros datos de credencial (§25/§4)."""
        sembrar_auditoria(
            db,
            cuenta_rh,
            entidad_id=1,
            fecha=datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc),
        )
        item = client.get(URL_RH_AUDITS, headers=cabecera(token_rh)).json()["items"][0]
        assert "password_hash" not in item
        assert item["actor_email"] == "rh@empresa.dev"
        assert item["actor_cuenta_id"] == cuenta_rh.id

    def test_propiedades_del_registro(self, client, token_rh, cuenta_rh, db):
        momento = datetime(2026, 9, 30, 8, 30, tzinfo=timezone.utc)
        sembrar_auditoria(
            db,
            cuenta_rh,
            entidad_id=42,
            fecha=momento,
            valores_anteriores={"rol": "Dev"},
            valores_nuevos={"rol": "Senior"},
            motivo="Ajuste por corrección",
        )
        item = client.get(URL_RH_AUDITS, headers=cabecera(token_rh)).json()["items"][0]
        assert item["entidad"] == "participacion"
        assert item["entidad_id"] == 42
        assert item["operacion"] == "CORRECCION"
        assert item["valores_anteriores"] == {"rol": "Dev"}
        assert item["valores_nuevos"] == {"rol": "Senior"}
        assert item["motivo"] == "Ajuste por corrección"
        # El instante se conserva aunque el backend lo serialice en su zona.
        assert datetime.fromisoformat(item["fecha"]).astimezone(
            timezone.utc
        ) == momento

    def test_valores_y_motivo_nullable(self, client, token_rh, cuenta_rh, db):
        """§25: valores JSONB y motivo son nullable; se exponen tal cual."""
        sembrar_auditoria(
            db,
            cuenta_rh,
            entidad_id=3,
            fecha=datetime(2026, 10, 2, 9, 0, tzinfo=timezone.utc),
        )
        item = client.get(URL_RH_AUDITS, headers=cabecera(token_rh)).json()["items"][0]
        assert item["valores_anteriores"] is None
        assert item["valores_nuevos"] is None
        assert item["motivo"] is None


class TestPaginacion:
    @pytest.fixture()
    def cinco(self, db, cuenta_rh):
        base = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
        return [
            sembrar_auditoria(
                db, cuenta_rh, entidad_id=indice, fecha=base + timedelta(minutes=indice)
            )
            for indice in range(5)
        ]

    def test_pagina_refleja_el_conjunto(self, client, token_rh, cinco):
        datos = client.get(
            f"{URL_RH_AUDITS}?pagina=2&por_pagina=2", headers=cabecera(token_rh)
        ).json()
        assert datos["total"] == 5
        assert datos["pagina"] == 2
        assert datos["por_pagina"] == 2
        assert len(datos["items"]) == 2
        # La página 3 conserva el total y trae el registro restante.
        ultima = client.get(
            f"{URL_RH_AUDITS}?pagina=3&por_pagina=2", headers=cabecera(token_rh)
        ).json()
        assert ultima["total"] == 5
        assert len(ultima["items"]) == 1

    @pytest.mark.parametrize(
        "consulta", ["?pagina=0", "?por_pagina=0", "?por_pagina=101", "?pagina=-1"]
    )
    def test_limites_invalidos_rechazados(self, client, token_rh, consulta):
        assert (
            client.get(f"{URL_RH_AUDITS}{consulta}", headers=cabecera(token_rh)).status_code
            == 422
        )

    def test_pagina_mas_alla_del_total_devuelve_vacia_sin_romper(
        self, client, token_rh, cinco
    ):
        datos = client.get(
            f"{URL_RH_AUDITS}?pagina=99", headers=cabecera(token_rh)
        ).json()
        assert datos["total"] == 5
        assert datos["items"] == []


class TestOrdenDeterminista:
    @pytest.fixture()
    def sembrados(self, db, cuenta_rh):
        """Tres registros: dos con la MISMA fecha (desempate por id)."""
        compartida = datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc)
        primero = sembrar_auditoria(
            db, cuenta_rh, entidad_id=1, fecha=compartida, motivo="A"
        )
        segundo = sembrar_auditoria(
            db, cuenta_rh, entidad_id=2, fecha=compartida, motivo="B"
        )
        tercero = sembrar_auditoria(
            db,
            cuenta_rh,
            entidad_id=3,
            fecha=compartida + timedelta(hours=1),
            motivo="C",
        )
        return primero, segundo, tercero

    def test_fecha_desc_con_desempate_por_id_desc(self, client, token_rh, sembrados):
        primero, segundo, tercero = sembrados
        ids = [
            item["id"]
            for item in client.get(URL_RH_AUDITS, headers=cabecera(token_rh)).json()[
                "items"
            ]
        ]
        # Más reciente primero; entre los dos de la misma fecha, el id mayor.
        assert ids == [tercero.id, segundo.id, primero.id]

    def test_consulta_repetida_devuelve_el_mismo_orden(
        self, client, token_rh, sembrados
    ):
        ordenes = {
            tuple(
                item["id"]
                for item in client.get(
                    f"{URL_RH_AUDITS}?por_pagina=100", headers=cabecera(token_rh)
                ).json()["items"]
            )
            for _ in range(3)
        }
        assert len(ordenes) == 1


class TestSoloLectura:
    def test_consulta_no_genera_auditoria(self, client, token_rh, cuenta_rh, db):
        """§25: la lectura no amplía qué operaciones generan auditoría."""
        sembrar_auditoria(
            db,
            cuenta_rh,
            entidad_id=1,
            fecha=datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc),
        )
        antes = contar_auditorias(db)
        client.get(URL_RH_AUDITS, headers=cabecera(token_rh))
        client.get(f"{URL_RH_AUDITS}?pagina=2", headers=cabecera(token_rh))
        assert contar_auditorias(db) == antes

    def test_consulta_sobre_base_vacia_no_inventa_registros(
        self, client, token_rh, db
    ):
        client.get(URL_RH_AUDITS, headers=cabecera(token_rh))
        assert contar_auditorias(db) == 0


class TestVisibilidadDeCorreccionReal:
    def test_tras_correccion_rh_el_registro_es_consultable(
        self, client, token_rh, db, cuenta_empleado
    ):
        """End-to-end: el PATCH audita (§25) y GET /rh/audits lo devuelve."""
        from app.core.fechas import fecha_negocio_hoy
        from app.core.normalizacion import normalizar_nombre
        from app.models.participacion import Participacion
        from app.models.proyecto import Proyecto

        proyecto = Proyecto(
            nombre="Proyecto Consulta",
            nombre_normalizado=normalizar_nombre("Proyecto Consulta"),
        )
        db.add(proyecto)
        db.flush()
        registro = Participacion(
            empleado_id=cuenta_empleado.empleado_id,
            proyecto_id=proyecto.id,
            rol="Dev",
            horas=100,
            fecha_registro=fecha_negocio_hoy(),
        )
        db.add(registro)
        db.commit()
        db.refresh(registro)

        respuesta = client.patch(
            f"{URL_RH_PARTICIPACIONES}/{registro.id}",
            json={"horas": 175, "motivo": "Corrección de horas"},
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 200

        datos = client.get(URL_RH_AUDITS, headers=cabecera(token_rh)).json()
        assert datos["total"] == 1
        item = datos["items"][0]
        assert item["entidad"] == "participacion"
        assert item["entidad_id"] == registro.id
        assert item["operacion"] == "CORRECCION"
        assert item["valores_anteriores"] == {"horas": 100}
        assert item["valores_nuevos"] == {"horas": 175}
        assert item["motivo"] == "Corrección de horas"
        assert item["actor_email"] == "rh@empresa.dev"
        # Contexto del registro auditado, resuelto por el backend.
        assert item["empleado_nombre"] == "Empleado Prueba"
        assert item["proyecto_nombre"] == "Proyecto Consulta"


class TestContextoDelRegistro:
    """El endpoint identifica empleado/proyecto sin N+1 ni datos inventados."""

    def _participacion(
        self, db, cuenta_empleado, *, nombre_empleado, nombre_proyecto
    ):
        from app.core.fechas import fecha_negocio_hoy
        from app.core.normalizacion import normalizar_nombre
        from app.models.participacion import Participacion
        from app.models.proyecto import Proyecto

        cuenta_empleado.empleado.nombre = nombre_empleado
        proyecto = Proyecto(
            nombre=nombre_proyecto,
            nombre_normalizado=normalizar_nombre(nombre_proyecto),
        )
        db.add(proyecto)
        db.flush()
        registro = Participacion(
            empleado_id=cuenta_empleado.empleado_id,
            proyecto_id=proyecto.id,
            rol="Dev",
            horas=100,
            fecha_registro=fecha_negocio_hoy(),
        )
        db.add(registro)
        db.commit()
        db.refresh(registro)
        return registro

    def test_correccion_real_expone_empleado_y_proyecto(
        self, client, token_rh, db, cuenta_empleado
    ):
        registro = self._participacion(
            db,
            cuenta_empleado,
            nombre_empleado="Ana Ejemplo",
            nombre_proyecto="Proyecto Contexto",
        )
        respuesta = client.patch(
            f"{URL_RH_PARTICIPACIONES}/{registro.id}",
            json={"horas": 120, "motivo": "Ajuste"},
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 200

        item = client.get(URL_RH_AUDITS, headers=cabecera(token_rh)).json()[
            "items"
        ][0]
        assert item["empleado_nombre"] == "Ana Ejemplo"
        assert item["proyecto_nombre"] == "Proyecto Contexto"

    def test_participacion_inexistente_deja_nombres_en_none(
        self, client, token_rh, cuenta_rh, db
    ):
        sembrar_auditoria(
            db,
            cuenta_rh,
            entidad_id=999999,
            fecha=datetime(2026, 10, 3, 10, 0, tzinfo=timezone.utc),
            valores_anteriores={"horas": 1},
            valores_nuevos={"horas": 2},
        )
        item = client.get(URL_RH_AUDITS, headers=cabecera(token_rh)).json()[
            "items"
        ][0]
        assert item["empleado_nombre"] is None
        assert item["proyecto_nombre"] is None

    def test_entidad_no_participacion_deja_nombres_en_none(
        self, client, token_rh, cuenta_rh, db
    ):
        registro = AuditoriaModificacion(
            actor_cuenta_id=cuenta_rh.id,
            entidad="empleado",
            entidad_id=1,
            operacion="CORRECCION",
            fecha=datetime(2026, 10, 3, 11, 0, tzinfo=timezone.utc),
        )
        db.add(registro)
        db.commit()
        item = client.get(URL_RH_AUDITS, headers=cabecera(token_rh)).json()[
            "items"
        ][0]
        assert item["empleado_nombre"] is None
        assert item["proyecto_nombre"] is None
