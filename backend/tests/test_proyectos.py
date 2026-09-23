"""Tests de proyectos: creación, administración RH, búsqueda y permisos (Fase 4A)."""

import pytest
from sqlalchemy import func, select

from app.core.normalizacion import normalizar_nombre
from app.models.participacion import Participacion
from app.models.proyecto import Proyecto
from tests.helpers import (
    URL_BUSQUEDA_PROYECTOS,
    URL_ME_PROYECTOS,
    URL_RH_PROYECTOS,
    cabecera,
    login_y_token,
)


@pytest.fixture()
def token_rh(client, cuenta_rh):
    return login_y_token(client, "rh@empresa.dev")


@pytest.fixture()
def token_empleado(client, cuenta_empleado):
    return login_y_token(client, "empleado@empresa.dev")


def sembrar_proyecto(db, nombre: str, **campos) -> Proyecto:
    proyecto = Proyecto(
        nombre=nombre,
        nombre_normalizado=normalizar_nombre(nombre),
        estado="EN_PROCESO",
        **campos,
    )
    db.add(proyecto)
    db.commit()
    db.refresh(proyecto)
    return proyecto


def contar_participaciones(db) -> int:
    return int(db.scalar(select(func.count()).select_from(Participacion)) or 0)


class TestCrearProyectoEmpleado:
    def test_crear_inicia_en_proceso(self, client, token_empleado):
        respuesta = client.post(
            URL_ME_PROYECTOS,
            json={"nombre": "Proyecto Nuevo", "area": "TI", "cliente": "ACME"},
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 201, respuesta.text
        datos = respuesta.json()
        assert datos["estado"] == "EN_PROCESO"
        assert datos["nombre_normalizado"] == "proyecto nuevo"

    def test_normalizacion_al_crear(self, client, token_empleado):
        respuesta = client.post(
            URL_ME_PROYECTOS,
            json={"nombre": "  Proyecto ÁRBOL  "},
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 201
        assert respuesta.json()["nombre_normalizado"] == "proyecto arbol"

    def test_duplicado_exacto_rechazado(self, client, token_empleado, db):
        sembrar_proyecto(db, "Proyecto Árbol")
        respuesta = client.post(
            URL_ME_PROYECTOS,
            json={"nombre": "proyecto ARBOL"},
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 409

    def test_nombre_vacio_rechazado(self, client, token_empleado):
        assert client.post(
            URL_ME_PROYECTOS, json={"nombre": "   "}, headers=cabecera(token_empleado)
        ).status_code == 422

    def test_rh_no_tiene_endpoint_de_creacion(self, client, token_rh):
        """RH administra proyectos existentes, NO crea desde cero (PRD §11.1)."""
        respuesta = client.post(
            URL_RH_PROYECTOS,
            json={"nombre": "Admin Nuevo"},
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 405  # el método no existe en el router RH

    def test_sin_token_rechazado(self, client):
        assert client.post(URL_ME_PROYECTOS, json={"nombre": "X1"}).status_code == 401


class TestAdministracionRH:
    @pytest.fixture()
    def proyecto(self, db):
        return sembrar_proyecto(db, "Proyecto Base", area="TI", cliente="ACME")

    def test_listar_paginado(self, client, token_rh, db, proyecto):
        sembrar_proyecto(db, "Proyecto Extra")
        lista = client.get(
            f"{URL_RH_PROYECTOS}?por_pagina=1", headers=cabecera(token_rh)
        ).json()
        assert lista["total"] == 2
        assert len(lista["items"]) == 1

    def test_consultar(self, client, token_rh, proyecto):
        respuesta = client.get(
            f"{URL_RH_PROYECTOS}/{proyecto.id}", headers=cabecera(token_rh)
        )
        assert respuesta.status_code == 200
        assert respuesta.json()["nombre"] == "Proyecto Base"

    def test_consultar_inexistente_404(self, client, token_rh):
        assert client.get(
            f"{URL_RH_PROYECTOS}/9999", headers=cabecera(token_rh)
        ).status_code == 404

    def test_editar_campos_administrativos(self, client, token_rh, proyecto):
        respuesta = client.patch(
            f"{URL_RH_PROYECTOS}/{proyecto.id}",
            json={"area": "Datos", "cliente": "CORP", "estado": "COMPLETADO"},
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 200
        assert respuesta.json()["estado"] == "COMPLETADO"
        assert respuesta.json()["area"] == "Datos"

    def test_estado_invalido_rechazado(self, client, token_rh, proyecto):
        respuesta = client.patch(
            f"{URL_RH_PROYECTOS}/{proyecto.id}",
            json={"estado": "EN_PAUSA"},
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 422

    def test_rename_renormaliza_y_valida_duplicado(self, client, token_rh, db, proyecto):
        otro = sembrar_proyecto(db, "Proyecto Final")
        # Renombrar a un nombre válido renormaliza.
        ok = client.patch(
            f"{URL_RH_PROYECTOS}/{proyecto.id}",
            json={"nombre": "  Proyecto BÁSE  "},
            headers=cabecera(token_rh),
        )
        assert ok.status_code == 200
        assert ok.json()["nombre_normalizado"] == "proyecto base"

        # Renombrar hacia un duplicado normalizado existente: 409.
        conflicto = client.patch(
            f"{URL_RH_PROYECTOS}/{proyecto.id}",
            json={"nombre": "PROYECTO FINAL"},
            headers=cabecera(token_rh),
        )
        assert conflicto.status_code == 409
        _ = otro

    def test_empleado_no_puede_administrar(self, client, token_empleado, proyecto):
        for metodo, ruta in (
            ("GET", URL_RH_PROYECTOS),
            ("GET", f"{URL_RH_PROYECTOS}/{proyecto.id}"),
            ("PATCH", f"{URL_RH_PROYECTOS}/{proyecto.id}"),
        ):
            # httpx no acepta json en GET; solo se envía cuerpo en PATCH.
            kwargs = {} if metodo == "GET" else {"json": {"estado": "CANCELADO"}}
            respuesta = getattr(client, metodo.lower())(
                ruta, headers=cabecera(token_empleado), **kwargs
            )
            assert respuesta.status_code == 403


class TestBusquedaProyectos:
    """Búsqueda obligatoria: exacta primero, luego pg_trgm (§8)."""

    @pytest.fixture(autouse=True)
    def _catalogo(self, db):
        sembrar_proyecto(db, "Proyecto Árbol")
        sembrar_proyecto(db, "Proyecto Alpha")
        sembrar_proyecto(db, "Proyecto Alfabeto")

    def test_coincidencia_exacta_normalizada(self, client, token_empleado):
        respuesta = client.get(
            f"{URL_BUSQUEDA_PROYECTOS}?nombre=  PROYECTO arbol ",
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["consulta_normalizada"] == "proyecto arbol"
        assert datos["coincidencia_exacta"]["nombre_normalizado"] == "proyecto arbol"
        # Con coincidencia exacta no se emiten sugerencias (§8).
        assert datos["sugerencias"] == []

    def test_sugerencias_aproximadas_ordenadas(self, client, token_empleado):
        respuesta = client.get(
            f"{URL_BUSQUEDA_PROYECTOS}?nombre=proyecto alfa",
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["coincidencia_exacta"] is None
        nombres = [s["proyecto"]["nombre_normalizado"] for s in datos["sugerencias"]]
        assert "proyecto alpha" in nombres
        assert "proyecto alfabeto" in nombres
        # Todas las sugerencias superan el umbral y vienen ordenadas.
        similitudes = [s["similitud"] for s in datos["sugerencias"]]
        assert all(s > 0.30 for s in similitudes)
        assert similitudes == sorted(similitudes, reverse=True)

    def test_umbral_excluye_no_parecidos(self, client, token_empleado):
        """Nombres sin semejanza (>0.30) no generan sugerencias."""
        respuesta = client.get(
            f"{URL_BUSQUEDA_PROYECTOS}?nombre=zentro de datos corporativo",
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["coincidencia_exacta"] is None
        assert datos["sugerencias"] == []

    def test_maximo_cinco_sugerencias(self, client, token_empleado, db):
        for indice in range(8):
            sembrar_proyecto(db, f"Proyecto Alfa {indice}")
        respuesta = client.get(
            f"{URL_BUSQUEDA_PROYECTOS}?nombre=proyecto alfa",
            headers=cabecera(token_empleado),
        )
        sugerencias = respuesta.json()["sugerencias"]
        assert len(sugerencias) == 5

    def test_busqueda_no_crea_relacion(self, client, token_empleado, db):
        """La coincidencia aproximada es informativa: nunca crea participación."""
        assert client.get(
            f"{URL_BUSQUEDA_PROYECTOS}?nombre=proyecto alfa",
            headers=cabecera(token_empleado),
        ).status_code == 200
        assert contar_participaciones(db) == 0

    def test_coincidencia_aproximada_no_impide_crear(self, client, token_empleado):
        """Advertencia informativa (PRD §11.3): el Empleado decide si es nuevo."""
        respuesta = client.post(
            URL_ME_PROYECTOS,
            json={"nombre": "Proyecto Alfa"},
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 201

    def test_busqueda_requiere_empleado(self, client, token_rh):
        respuesta = client.get(
            f"{URL_BUSQUEDA_PROYECTOS}?nombre=proyecto arbol",
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 403

    def test_busqueda_sin_token(self, client):
        assert client.get(
            f"{URL_BUSQUEDA_PROYECTOS}?nombre=x"
        ).status_code == 401

    def test_busqueda_nombre_vacio(self, client, token_empleado):
        assert client.get(
            f"{URL_BUSQUEDA_PROYECTOS}?nombre=   ", headers=cabecera(token_empleado)
        ).status_code == 422
