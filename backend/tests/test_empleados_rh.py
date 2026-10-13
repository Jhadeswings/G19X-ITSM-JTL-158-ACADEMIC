"""Tests de gestión de empleados por RH (Fase 4A)."""

import logging

import pytest
from sqlalchemy import select

from app.models.cuenta_acceso import CuentaAcceso
from app.models.empleado import Empleado
from app.services import correo_service
from tests.helpers import (
    PASSWORD_PRUEBA,
    URL_LOGIN,
    URL_RH_EMPLEADOS,
    cabecera,
    correos_a,
    login_y_token,
    secreto_de_correo,
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

    def test_cuenta_nueva_usa_credencial_temporal(self, client, token_rh, correo_simulado):
        """La credencial temporal llega por correo y funciona en el primer login."""
        assert client.post(
            URL_RH_EMPLEADOS, json=ALTA, headers=cabecera(token_rh)
        ).status_code == 201
        credencial = secreto_de_correo(correo_simulado, "Credencial temporal")
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


class TestEnvioCredencialTemporal:
    """Entrega por correo (PRD §3.3; DECISIONES §53), con proveedor simulado."""

    def test_envia_al_correo_correcto_y_mantiene_cambio_obligatorio(
        self, client, token_rh, correo_simulado
    ):
        respuesta = client.post(
            URL_RH_EMPLEADOS, json=ALTA, headers=cabecera(token_rh)
        )
        assert respuesta.status_code == 201, respuesta.text

        # UN correo, dirigido al correo de acceso registrado.
        assert len(correos_a(correo_simulado, "nuevo@empresa.dev")) == 1
        credencial = secreto_de_correo(correo_simulado, "Credencial temporal")

        # La credencial del correo ES la de la cuenta: el primer login
        # funciona y sigue exigiendo el cambio (§4.2).
        login = client.post(
            URL_LOGIN,
            json={"email": "nuevo@empresa.dev", "password": credencial},
        )
        assert login.status_code == 200
        assert login.json()["must_change_password"] is True

        # La respuesta API sigue SIN exponer la credencial.
        assert credencial not in respuesta.text

    def test_proveedor_falla_503_y_no_crea_la_cuenta(
        self, client, token_rh, db, correo_simulado, monkeypatch, caplog
    ):
        def _rechazar(_mensaje, _conf=None):
            raise correo_service.ErrorEnvioCorreo("proveedor caído")

        monkeypatch.setattr(correo_service, "_enviar_smtp", _rechazar)
        caplog.set_level(logging.ERROR, logger="app.services.empleado_service")

        respuesta = client.post(
            URL_RH_EMPLEADOS, json=ALTA, headers=cabecera(token_rh)
        )

        assert respuesta.status_code == 503
        assert "credencial temporal" in respuesta.json()["detail"]
        # Nada quedó creado: ni empleado ni cuenta huérfana.
        assert (
            db.scalar(
                select(CuentaAcceso).where(
                    CuentaAcceso.email == "nuevo@empresa.dev"
                )
            )
            is None
        )
        assert db.scalars(select(Empleado)).all() == []
        # Ningún correo aceptado; el log explica la causa SIN la credencial.
        assert correo_simulado.aceptados == []
        assert "Temporal" not in caplog.text
        assert "nuevo@empresa.dev" in caplog.text

    def test_proveedor_no_configurado_503_sin_cuenta(
        self, client, token_rh, db, monkeypatch
    ):
        def _sin_configurar(_mensaje, _conf=None):
            raise correo_service.ErrorCorreoNoConfigurado("sin SMTP")

        monkeypatch.setattr(correo_service, "_enviar_smtp", _sin_configurar)

        respuesta = client.post(
            URL_RH_EMPLEADOS, json=ALTA, headers=cabecera(token_rh)
        )

        assert respuesta.status_code == 503
        assert (
            db.scalar(
                select(CuentaAcceso).where(
                    CuentaAcceso.email == "nuevo@empresa.dev"
                )
            )
            is None
        )


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


class TestFiltroArea:
    """Filtro ``area``: coincidencia EXACTA normalizada (PRD §20.1).

    El parámetro y la columna se comparan con la MISMA transformación
    (minúsculas, ``trim`` y espacios internos colapsados). Un área con acento
    —"Tecnología"— debe poder filtrarse por su propio valor, el filtro NO
    puede volverse una búsqueda parcial y el acento es significativo (no se
    elimina): "Tecnología" y "Tecnologia" son áreas distintas.
    """

    @pytest.fixture(autouse=True)
    def _areas(self, db):
        from tests.helpers import crear_cuenta, crear_empleado

        self.casos = {}
        for nombre, area in (
            ("Empleado tecnologia", "Tecnología"),
            ("Empleado marketing", "Marketing"),
            ("Empleado datos", "Datos"),
        ):
            empleado = crear_empleado(db, nombre=nombre)
            empleado.area = area
            db.commit()
            crear_cuenta(
                db, rol="EMPLEADO", email=f"{nombre.replace(' ', '')}@empresa.dev",
                empleado=empleado,
            )
            self.casos[area] = empleado.id

    def _filtrar(self, client, token, area: str):
        respuesta = client.get(
            f"{URL_RH_EMPLEADOS}",
            params={"area": area},
            headers=cabecera(token),
        )
        assert respuesta.status_code == 200, respuesta.text
        return respuesta.json()

    def test_area_con_acento_exacta(self, client, token_rh):
        datos = self._filtrar(client, token_rh, "Tecnología")
        assert datos["total"] == 1
        assert datos["items"][0]["area"] == "Tecnología"

    def test_area_sin_acento_sigue_funcionando(self, client, token_rh):
        datos = self._filtrar(client, token_rh, "Marketing")
        assert datos["total"] == 1
        assert datos["items"][0]["area"] == "Marketing"

    def test_area_ignora_mayusculas_y_espacios(self, client, token_rh):
        for variante in ("marketing", "MARKETING", "  Marketing  "):
            datos = self._filtrar(client, token_rh, variante)
            assert datos["total"] == 1, variante

    def test_area_ignora_mayusculas_conservando_el_acento(self, client, token_rh):
        for variante in ("tecnología", "TECNOLOGÍA", "  Tecnología  "):
            datos = self._filtrar(client, token_rh, variante)
            assert datos["total"] == 1, variante

    def test_area_sin_acento_no_coincide(self, client, token_rh):
        """Comportamiento actual: el acento es significativo (sin ``unaccent``).

        La búsqueda general insensible a acentos será un bloque arquitectónico
        independiente; aquí la coincidencia sigue siendo EXACTA.
        """
        for variante in ("Tecnologia", "tecnologia"):
            datos = self._filtrar(client, token_rh, variante)
            assert datos["total"] == 0, variante
            assert datos["items"] == [], variante

    def test_area_desconocida_devuelve_cero(self, client, token_rh):
        datos = self._filtrar(client, token_rh, "Finanzas")
        assert datos["total"] == 0
        assert datos["items"] == []

    @pytest.mark.parametrize("parcial", ["Tec", "Tecnolog", "colog", "Mark"])
    def test_no_es_busqueda_parcial(self, client, token_rh, parcial):
        """El filtro sigue siendo coincidencia EXACTA: un fragmento no basta."""
        assert self._filtrar(client, token_rh, parcial)["total"] == 0

    def test_area_vacia_no_filtra(self, client, token_rh):
        datos = self._filtrar(client, token_rh, "")
        assert datos["total"] >= 3

    def test_area_solo_espacios_equivale_a_sin_filtro(self, client, token_rh):
        """Un área que queda vacía al normalizar NO se vuelve un filtro vacío."""
        sin_filtro = self._filtrar(client, token_rh, "")
        solo_espacios = self._filtrar(client, token_rh, "   ")

        assert solo_espacios["total"] == sin_filtro["total"]
        assert solo_espacios["total"] >= 3

    def test_espacios_internos_consistentes(self, client, token_rh, db):
        """El colapso de espacios internos es simétrico en parámetro y columna.

        RH pudo guardar un área con espacios repetidos; como ambos lados se
        colapsan igual, todas las variantes equivalentes encuentran el registro.
        """
        from tests.helpers import crear_cuenta, crear_empleado

        empleado = crear_empleado(db, nombre="Empleado espacios")
        empleado.area = "Recursos  Humanos"  # dos espacios internos almacenados
        db.commit()
        crear_cuenta(
            db, rol="EMPLEADO", email="espacios@empresa.dev", empleado=empleado
        )

        for variante in (
            "Recursos  Humanos",  # idéntico a lo almacenado
            "  Recursos Humanos  ",  # espacios exteriores y uno interno
            "recursos   humanos",  # otras mayúsculas y más espacios internos
        ):
            datos = self._filtrar(client, token_rh, variante)
            assert datos["total"] == 1, variante
            assert datos["items"][0]["id"] == empleado.id

    def test_el_rh_que_consulta_no_aparece_en_su_propio_filtro(self, client, token_rh, db):
        """RH no es Empleado: el filtro no lo incluye aunque su cuenta exista.

        El catálogo es de empleados; la cuenta de RH existe sin ``empleado_id``
        (PRD §3.2) y por tanto nunca debe sumar filas al filtro por área.
        """
        from sqlalchemy import select

        from app.models.cuenta_acceso import CuentaAcceso
        from app.models.empleado import Empleado

        rh = db.scalar(
            select(CuentaAcceso).where(CuentaAcceso.rol == "RH")
        )
        assert rh is not None
        assert rh.empleado_id is None
        # Y el área sigue devolviendo solo al empleado de "Tecnología".
        assert self._filtrar(client, token_rh, "Tecnología")["total"] == 1


class TestBusquedaNombrePuesto:
    """Búsqueda ``q`` por nombre/puesto (PRD §20.1).

    Es un concepto DISTINTO del filtro de área: coincidencia PARCIAL sobre
    ``nombre`` y ``puesto``, con la misma normalización simétrica (minúsculas,
    ``trim``, espacios internos colapsados) y el acento significativo (sin
    ``unaccent``, igual que ``area``). La ejecuta el backend; ``area`` conserva
    su semántica EXACTA y ambos componen con AND.
    """

    @pytest.fixture(autouse=True)
    def _personas(self, db):
        from tests.helpers import crear_cuenta, crear_empleado

        for nombre, puesto in (
            ("Ana López", "Analista de datos"),
            ("Luis Pérez", "Desarrollador backend"),
            ("María Gómez", "Analista senior"),
        ):
            empleado = crear_empleado(db, nombre=nombre)
            empleado.puesto = puesto
            db.commit()
            crear_cuenta(
                db,
                rol="EMPLEADO",
                email=f"{nombre.split()[0].lower()}@empresa.dev",
                empleado=empleado,
            )

    def _buscar(self, client, token, q: str):
        respuesta = client.get(
            URL_RH_EMPLEADOS,
            params={"q": q},
            headers=cabecera(token),
        )
        assert respuesta.status_code == 200, respuesta.text
        return respuesta.json()

    def test_busca_por_nombre_parcial(self, client, token_rh):
        datos = self._buscar(client, token_rh, "gómez")
        assert datos["total"] == 1
        assert datos["items"][0]["nombre"] == "María Gómez"

    def test_busca_por_puesto(self, client, token_rh):
        datos = self._buscar(client, token_rh, "desarrollador")
        assert datos["total"] == 1
        assert datos["items"][0]["nombre"] == "Luis Pérez"

    def test_busca_en_ambos_campos(self, client, token_rh):
        """El puesto de Ana y de María comparten «Analista»: ambas aparecen."""
        datos = self._buscar(client, token_rh, "analista")
        assert datos["total"] == 2
        assert {item["nombre"] for item in datos["items"]} == {
            "Ana López",
            "María Gómez",
        }

    def test_ignora_mayusculas_y_espacios_exteriores(self, client, token_rh):
        for variante in ("ANALISTA", "  analista  ", "Ana"):
            assert self._buscar(client, token_rh, variante)["total"] >= 1, variante

    def test_el_acento_es_significativo_como_en_area(self, client, token_rh):
        """Sin ``unaccent``: «lopez» no encuentra a «López», como el filtro
        de área. La búsqueda insensible a acentos sería un bloque aparte."""
        assert self._buscar(client, token_rh, "lopez")["total"] == 0
        assert self._buscar(client, token_rh, "lópez")["total"] == 1

    def test_busqueda_sin_resultados_devuelve_cero(self, client, token_rh):
        datos = self._buscar(client, token_rh, "finanzas")
        assert datos["total"] == 0
        assert datos["items"] == []

    def test_busqueda_vacia_o_solo_espacios_no_filtra(self, client, token_rh):
        sin_q = client.get(URL_RH_EMPLEADOS, headers=cabecera(token_rh)).json()
        assert sin_q["total"] >= 3

        for vacia in ("", "   "):
            assert self._buscar(client, token_rh, vacia)["total"] == sin_q["total"]

    def test_combina_con_el_filtro_exacto_de_area(self, client, token_rh, db):
        """``q`` (parcial) y ``area`` (exacta) componen con AND: cada uno con
        su semántica, sin que la búsqueda relaje al filtro."""
        from tests.helpers import crear_cuenta, crear_empleado

        empleado = crear_empleado(db, nombre="Ana Torres")
        empleado.puesto = "Analista de datos"
        empleado.area = "Datos"
        db.commit()
        crear_cuenta(
            db, rol="EMPLEADO", email="anatorres@empresa.dev", empleado=empleado
        )

        respuesta = client.get(
            URL_RH_EMPLEADOS,
            params={"q": "analista", "area": "Datos"},
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 200, respuesta.text
        datos = respuesta.json()
        assert datos["total"] == 1
        assert datos["items"][0]["nombre"] == "Ana Torres"


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
