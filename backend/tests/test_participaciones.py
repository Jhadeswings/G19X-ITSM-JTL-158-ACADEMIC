"""Tests de participaciones y correcciones RH (Fase 4B)."""

import pytest
from sqlalchemy import select

from app.core.fechas import fecha_negocio_hoy
from app.models.auditoria_modificacion import AuditoriaModificacion
from app.models.participacion import Participacion
from tests.helpers import (
    URL_ME_PARTICIPACIONES,
    URL_RH_EMPLEADO_PARTICIPACIONES,
    URL_RH_PARTICIPACIONES,
    URL_RH_PROYECTO_PARTICIPACIONES,
    cabecera,
    crear_cuenta,
    crear_empleado,
    login_y_token,
)

REGISTRO = {
    "proyecto_id": 1,
    "rol": "Desarrollador",
    "entregables": "API de pagos",
    "en_equipo": True,
    "coordino_tareas": False,
    "explico_a_publico_distinto": True,
    "resolvio_problema": True,
    "horas": 120,
}


@pytest.fixture()
def token_rh(client, cuenta_rh):
    return login_y_token(client, "rh@empresa.dev")


@pytest.fixture()
def token_empleado(client, cuenta_empleado):
    return login_y_token(client, "empleado@empresa.dev")


@pytest.fixture()
def token_empleado_b(client, db):
    empleado_b = crear_empleado(db, nombre="Empleado B")
    crear_cuenta(db, rol="EMPLEADO", email="b@empresa.dev", empleado=empleado_b)
    return login_y_token(client, "b@empresa.dev")


@pytest.fixture()
def proyecto(db):
    from app.core.normalizacion import normalizar_nombre
    from app.models.proyecto import Proyecto

    proyecto = Proyecto(
        nombre="Proyecto Base", nombre_normalizado=normalizar_nombre("Proyecto Base")
    )
    db.add(proyecto)
    db.commit()
    db.refresh(proyecto)
    return proyecto


def contar_auditorias(db) -> int:
    return len(db.scalars(select(AuditoriaModificacion)).all())


class TestCrearParticipacion:
    def test_crear_como_empleado(self, client, token_empleado, proyecto, cuenta_empleado):
        respuesta = client.post(
            URL_ME_PARTICIPACIONES,
            json=dict(REGISTRO, proyecto_id=proyecto.id),
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 201, respuesta.text
        datos = respuesta.json()
        # empleado_id SIEMPRE desde la cuenta autenticada (§32).
        assert datos["empleado_id"] == cuenta_empleado.empleado_id
        assert datos["horas"] == 120
        assert datos["en_equipo"] is True
        assert datos["resolvio_problema"] is True  # dato contextual, sin lógica
        # fecha_registro la fija el servidor con la fecha de negocio (§12).
        assert datos["fecha_registro"] == fecha_negocio_hoy().isoformat()
        # La creación del propio empleado no se audita (solo correcciones RH).
        _ = cuenta_empleado

    def test_proyecto_inexistente_404(self, client, token_empleado):
        respuesta = client.post(
            URL_ME_PARTICIPACIONES,
            json=dict(REGISTRO, proyecto_id=9999),
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 404

    def test_duplicado_empleado_proyecto_409(self, client, token_empleado, proyecto):
        cuerpo = dict(REGISTRO, proyecto_id=proyecto.id)
        assert client.post(
            URL_ME_PARTICIPACIONES, json=cuerpo, headers=cabecera(token_empleado)
        ).status_code == 201
        assert client.post(
            URL_ME_PARTICIPACIONES, json=cuerpo, headers=cabecera(token_empleado)
        ).status_code == 409

    def test_mismo_proyecto_distinto_empleado_permitido(
        self, client, token_empleado, token_empleado_b, proyecto
    ):
        for token in (token_empleado, token_empleado_b):
            respuesta = client.post(
                URL_ME_PARTICIPACIONES,
                json=dict(REGISTRO, proyecto_id=proyecto.id),
                headers=cabecera(token),
            )
            assert respuesta.status_code == 201

    def test_horas_negativas_rechazadas(self, client, token_empleado, proyecto):
        respuesta = client.post(
            URL_ME_PARTICIPACIONES,
            json=dict(REGISTRO, proyecto_id=proyecto.id, horas=-1),
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 422

    def test_rol_vacio_rechazado(self, client, token_empleado, proyecto):
        respuesta = client.post(
            URL_ME_PARTICIPACIONES,
            json=dict(REGISTRO, proyecto_id=proyecto.id, rol="   "),
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 422

    def test_empleado_id_del_cliente_rechazado(self, client, token_empleado, proyecto):
        """Anti-IDOR: el contrato no acepta empleado_id en el cuerpo (422)."""
        respuesta = client.post(
            URL_ME_PARTICIPACIONES,
            json=dict(REGISTRO, proyecto_id=proyecto.id, empleado_id=99),
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 422

    def test_rh_no_puede_crear(self, client, token_rh, proyecto):
        respuesta = client.post(
            URL_ME_PARTICIPACIONES,
            json=dict(REGISTRO, proyecto_id=proyecto.id),
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 403

    def test_sin_token_401(self, client, proyecto):
        assert client.post(
            URL_ME_PARTICIPACIONES, json=dict(REGISTRO, proyecto_id=proyecto.id)
        ).status_code == 401


class TestConsultarYListar:
    @pytest.fixture()
    def participacion_propia(self, client, token_empleado, proyecto, cuenta_empleado):
        respuesta = client.post(
            URL_ME_PARTICIPACIONES,
            json=dict(REGISTRO, proyecto_id=proyecto.id),
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 201
        return respuesta.json()

    def test_consultar_propia(self, client, token_empleado, participacion_propia):
        respuesta = client.get(
            f"{URL_ME_PARTICIPACIONES}/{participacion_propia['id']}",
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 200
        assert respuesta.json()["rol"] == "Desarrollador"
        assert respuesta.json()["proyecto"]["nombre"] == "Proyecto Base"

    def test_consultar_ajena_404(self, client, token_empleado_b, participacion_propia):
        """IDOR: una participación ajena responde 404 uniforme (§32)."""
        respuesta = client.get(
            f"{URL_ME_PARTICIPACIONES}/{participacion_propia['id']}",
            headers=cabecera(token_empleado_b),
        )
        assert respuesta.status_code == 404

    def test_listar_solo_propias(self, client, token_empleado, token_empleado_b, proyecto):
        for token in (token_empleado, token_empleado_b):
            client.post(
                URL_ME_PARTICIPACIONES,
                json=dict(REGISTRO, proyecto_id=proyecto.id),
                headers=cabecera(token),
            )
        lista_b = client.get(
            URL_ME_PARTICIPACIONES, headers=cabecera(token_empleado_b)
        ).json()
        assert lista_b["total"] == 1

    def test_rh_lista_por_empleado(
        self, client, token_rh, token_empleado, proyecto, cuenta_empleado
    ):
        client.post(
            URL_ME_PARTICIPACIONES,
            json=dict(REGISTRO, proyecto_id=proyecto.id),
            headers=cabecera(token_empleado),
        )
        ruta = URL_RH_EMPLEADO_PARTICIPACIONES.format(
            empleado_id=cuenta_empleado.empleado_id
        )
        respuesta = client.get(ruta, headers=cabecera(token_rh))
        assert respuesta.status_code == 200
        assert respuesta.json()["total"] == 1

    def test_rh_consulta_participacion(
        self, client, token_rh, token_empleado, proyecto, participacion_propia
    ):
        respuesta = client.get(
            f"{URL_RH_PARTICIPACIONES}/{participacion_propia['id']}",
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 200

    def test_empleado_no_puede_usar_rutas_rh(
        self, client, token_empleado, cuenta_empleado, participacion_propia
    ):
        ruta_lista = URL_RH_EMPLEADO_PARTICIPACIONES.format(
            empleado_id=cuenta_empleado.empleado_id
        )
        assert client.get(ruta_lista, headers=cabecera(token_empleado)).status_code == 403
        assert client.get(
            f"{URL_RH_PARTICIPACIONES}/{participacion_propia['id']}",
            headers=cabecera(token_empleado),
        ).status_code == 403
        assert client.patch(
            f"{URL_RH_PARTICIPACIONES}/{participacion_propia['id']}",
            json={"horas": 1},
            headers=cabecera(token_empleado),
        ).status_code == 403


class TestEdicionEmpleado:
    """Tras el alta, el Empleado SOLO edita rol/entregables/horas (§12.1)."""

    @pytest.fixture()
    def propia(self, client, token_empleado, proyecto):
        respuesta = client.post(
            URL_ME_PARTICIPACIONES,
            json=dict(REGISTRO, proyecto_id=proyecto.id),
            headers=cabecera(token_empleado),
        )
        return respuesta.json()

    def test_editar_campos_permitidos(self, client, token_empleado, propia):
        respuesta = client.patch(
            f"{URL_ME_PARTICIPACIONES}/{propia['id']}",
            json={"rol": "Líder Técnico", "entregables": "Nuevo entregable", "horas": 200},
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["rol"] == "Líder Técnico"
        assert datos["horas"] == 200

    @pytest.mark.parametrize(
        "campo,valor",
        [
            ("empleado_id", 99),
            ("proyecto_id", 2),
            ("en_equipo", False),
            ("coordino_tareas", True),
            ("explico_a_publico_distinto", False),
            ("resolvio_problema", False),
            ("fecha_registro", "2020-01-01"),
        ],
    )
    def test_campos_bloqueados_rechazados_422(
        self, client, token_empleado, propia, campo, valor
    ):
        """Contrato estricto: nada se ignora silenciosamente."""
        respuesta = client.patch(
            f"{URL_ME_PARTICIPACIONES}/{propia['id']}",
            json={campo: valor},
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 422

    def test_indicadores_no_cambiaron_tras_intento(self, client, token_empleado, propia):
        client.patch(
            f"{URL_ME_PARTICIPACIONES}/{propia['id']}",
            json={"en_equipo": False, "resolvio_problema": False},
            headers=cabecera(token_empleado),
        )
        actual = client.get(
            f"{URL_ME_PARTICIPACIONES}/{propia['id']}",
            headers=cabecera(token_empleado),
        ).json()
        assert actual["en_equipo"] is True
        assert actual["resolvio_problema"] is True

    def test_cuerpo_vacio_422(self, client, token_empleado, propia):
        assert client.patch(
            f"{URL_ME_PARTICIPACIONES}/{propia['id']}",
            json={},
            headers=cabecera(token_empleado),
        ).status_code == 422

    def test_editar_ajena_404(self, client, token_empleado_b, propia):
        assert client.patch(
            f"{URL_ME_PARTICIPACIONES}/{propia['id']}",
            json={"rol": "X"},
            headers=cabecera(token_empleado_b),
        ).status_code == 404

    def test_edicion_empleado_no_genera_auditoria(
        self, client, token_empleado, propia, db
    ):
        client.patch(
            f"{URL_ME_PARTICIPACIONES}/{propia['id']}",
            json={"horas": 55},
            headers=cabecera(token_empleado),
        )
        assert contar_auditorias(db) == 0


class TestCorreccionRH:
    @pytest.fixture()
    def propia(self, client, token_empleado, proyecto):
        respuesta = client.post(
            URL_ME_PARTICIPACIONES,
            json=dict(REGISTRO, proyecto_id=proyecto.id),
            headers=cabecera(token_empleado),
        )
        return respuesta.json()

    def test_rh_corrige_campos_administrativos(self, client, token_rh, propia):
        """RH puede corregir incluso los indicadores bloqueados al Empleado."""
        respuesta = client.patch(
            f"{URL_RH_PARTICIPACIONES}/{propia['id']}",
            json={"en_equipo": False, "horas": 150, "rol": "Corregido"},
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["en_equipo"] is False
        assert datos["horas"] == 150

    def test_rh_no_puede_cambiar_identidad(self, client, token_rh, propia):
        """empleado_id/proyecto_id/fecha_registro no son corrección (422)."""
        for campo, valor in (
            ("empleado_id", 99),
            ("proyecto_id", 2),
            ("fecha_registro", "2020-01-01"),
        ):
            respuesta = client.patch(
                f"{URL_RH_PARTICIPACIONES}/{propia['id']}",
                json={campo: valor},
                headers=cabecera(token_rh),
            )
            assert respuesta.status_code == 422

    def test_rh_cuerpo_vacio_422(self, client, token_rh, propia):
        assert client.patch(
            f"{URL_RH_PARTICIPACIONES}/{propia['id']}",
            json={},
            headers=cabecera(token_rh),
        ).status_code == 422

    def test_rh_no_puede_crear(self, client, token_rh):
        """No existe POST de participaciones para RH (registro es del Empleado)."""
        respuesta = client.post(
            URL_RH_PARTICIPACIONES, json=REGISTRO, headers=cabecera(token_rh)
        )
        # 404/405: el endpoint de creación para RH simplemente no existe.
        assert respuesta.status_code in (404, 405)


class TestParticipacionesPorProyecto:
    """RH-02.1: participantes en el detalle de un proyecto (PRD §20.3/§12).

    Identificación humana (nombre/puesto) provista por el backend, orden
    cronológico de registro (NO un ranking de participantes), sin métricas
    ni 9-Box. La corrección administrativa de una participación sigue
    siendo el PATCH individual ya existente.
    """

    @pytest.fixture()
    def sembradas(self, db, proyecto):
        """Dos participaciones en el proyecto: Ana con puesto y Bo sin él (§30)."""
        ana = crear_empleado(
            db,
            nombre="Ana Ruiz",
            puesto="Desarrolladora de software",
            area="Tecnología",
        )
        bo = crear_empleado(db, nombre="Bo Marín")
        fecha = fecha_negocio_hoy()
        db.add(
            Participacion(
                empleado_id=ana.id,
                proyecto_id=proyecto.id,
                rol="Desarrollador",
                entregables="API de pagos",
                horas=120,
                fecha_registro=fecha,
            )
        )
        db.add(
            Participacion(
                empleado_id=bo.id,
                proyecto_id=proyecto.id,
                rol="QA",
                entregables=None,
                horas=40,
                fecha_registro=fecha,
            )
        )
        db.commit()
        return {"ana": ana, "bo": bo}

    def _url(self, proyecto_id, **query):
        ruta = URL_RH_PROYECTO_PARTICIPACIONES.format(proyecto_id=proyecto_id)
        return ruta + (f"?{'&'.join(f'{k}={v}' for k, v in query.items())}" if query else "")

    def test_lista_con_identificacion_del_empleado(
        self, client, token_rh, proyecto, sembradas
    ):
        respuesta = client.get(self._url(proyecto.id), headers=cabecera(token_rh))
        assert respuesta.status_code == 200, respuesta.text
        datos = respuesta.json()
        assert datos["total"] == 2

        por_empleado = {i["empleado_id"]: i for i in datos["items"]}
        ana = por_empleado[sembradas["ana"].id]
        assert ana["empleado_nombre"] == "Ana Ruiz"
        assert ana["empleado_puesto"] == "Desarrolladora de software"
        assert ana["rol"] == "Desarrollador"
        assert ana["horas"] == 120
        assert ana["entregables"] == "API de pagos"
        # Sin puesto registrado (§30): null, no inventado.
        bo = por_empleado[sembradas["bo"].id]
        assert bo["empleado_nombre"] == "Bo Marín"
        assert bo["empleado_puesto"] is None

    def test_no_mezcla_participaciones_de_otros_proyectos(
        self, client, token_rh, db, proyecto, sembradas
    ):
        from app.core.normalizacion import normalizar_nombre
        from app.models.proyecto import Proyecto

        otro = Proyecto(
            nombre="Otro Proyecto", nombre_normalizado=normalizar_nombre("Otro Proyecto")
        )
        db.add(otro)
        db.commit()
        db.refresh(otro)

        respuesta = client.get(self._url(otro.id), headers=cabecera(token_rh))
        assert respuesta.status_code == 200
        assert respuesta.json()["total"] == 0
        assert respuesta.json()["items"] == []

    def test_proyecto_inexistente_404(self, client, token_rh):
        assert (
            client.get(
                self._url(999), headers=cabecera(token_rh)
            ).status_code
            == 404
        )

    def test_empleado_no_puede_consultar(self, client, token_empleado, proyecto):
        assert (
            client.get(self._url(proyecto.id), headers=cabecera(token_empleado)).status_code
            == 403
        )

    def test_sin_token_401(self, client, proyecto):
        assert client.get(self._url(proyecto.id)).status_code == 401

    def test_paginado_del_contrato(self, client, token_rh, proyecto, sembradas):
        respuesta = client.get(
            self._url(proyecto.id, pagina=1, por_pagina=1), headers=cabecera(token_rh)
        )
        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["total"] == 2
        assert datos["por_pagina"] == 1
        assert len(datos["items"]) == 1

    def test_listado_por_empleado_queda_sin_identificacion(
        self, client, token_rh, proyecto, sembradas
    ):
        """Solo el endpoint por proyecto rellena la identificación (aditivo)."""
        ruta = URL_RH_EMPLEADO_PARTICIPACIONES.format(
            empleado_id=sembradas["ana"].id
        )
        item = client.get(ruta, headers=cabecera(token_rh)).json()["items"][0]
        assert item["empleado_nombre"] is None
        assert item["empleado_puesto"] is None
