"""Tests de ``GET /api/v1/me/result`` (MB-7-1, ET §31).

Contrato propio del Empleado autenticado: resultado actual OFICIAL sin capa
IA. Cubre: RBAC (401 sin token, 403 RH, 200 Empleado), ownership por token
(anti-IDOR con dos empleados de datos distinguibles: la ruta no acepta
``empleado_id`` en query, body ni path), contrato exacto del
``ResultadoActualDTO`` (cinco competencias en orden del engine,
CALCULABLE/INSUFFICIENT_DATA, ``nivel`` en ``None`` cuando aplica, etiquetas
oficiales §14, fortalezas/oportunidades del engine §19, experiencia como
contexto §17) y ausencia de campos prohibidos (ni score global, ni promedio,
ni ranking, ni 9-Box, ni ejes).

Además, dos garantías de por vida de la lectura (§18): la capa IA
(``AIOrchestrator``, ``GroqProveedor``, ``GeminiProveedor`` y
``RecommendationService``) NUNCA se invoca —el test falla si se invoca— y la
consulta es derivada: cero escrituras y respuesta determinista. Por último se
verifica que la ruta existente ``GET /me/progress/recommendation`` conserva su
contrato propio: ``/me/result`` no la altera ni la duplica.
"""

import json
from datetime import date, timedelta

import pytest
from sqlalchemy import text

import app.api.me_progress as modulo_progress
from app.core.fechas import fecha_negocio_hoy
from app.models.empleado import Empleado
from app.models.participacion import Participacion
from app.models.proyecto import Proyecto
from app.services.ai.ai_orchestrator import AIOrchestrator
from app.services.ai.proveedores import GeminiProveedor, GroqProveedor
from app.services.competency_engine import CompetencyEngine
from app.services.recomendacion_service import RecommendationService
from tests.helpers import (
    URL_ME_RECOMENDACION,
    URL_ME_RESULTADO,
    cabecera,
    crear_cuenta,
    crear_empleado,
    login_y_token,
)

ANIO = fecha_negocio_hoy().year

# Orden EXACTO de las cinco competencias (§16). Experiencia NO es competencia.
CLAVES = (
    "desempeno_tecnico",
    "liderazgo",
    "trabajo_equipo",
    "comunicacion",
    "aprendizaje",
)

# Etiquetas oficiales fijadas por el PRD (§14, diccionario único).
ETIQUETAS = {
    1: "Inicial",
    2: "En desarrollo",
    3: "En crecimiento",
    4: "Consolidado",
    5: "Alto",
}

DI = "INSUFFICIENT_DATA"
CALCULABLE = "CALCULABLE"

# Salida válida de proveedor falso, para la ruta IA que NO debe alterarse.
SALIDA_VALIDA_IA = json.dumps(
    {
        "recommendation": (
            "Practicar la coordinación de tareas en proyectos pequeños puede "
            "ayudar a ampliar tu desarrollo."
        ),
        "actions": ["Registrar participación en un proyecto pequeño coordinando."],
    }
)


class ProveedorFalso:
    """Mock mínimo con el Protocol de ``app.services.ai.proveedores``."""

    nombre = "groq"

    def generar(self, system, prompt):
        return SALIDA_VALIDA_IA

    def interpretar(self, prompt):
        return self.generar("", prompt)


def _prohibir_ia(monkeypatch) -> list:
    """Espías que hacen FALLAR el test si se invoca la capa IA (§31).

    Reutiliza el patrón de monkeypatch de ``tests/test_recomendacion_ia.py``,
    pero al revés: allí se sustituye el proveedor por un doble que registra;
    aquí se sustituye por una trampa que lanza ``AssertionError``. Si algún día
    ``/me/result`` conectara con IA, el test falla en el punto exacto.
    """
    invocaciones: list[str] = []

    def trampa(nombre):
        def fallar(*args, **kwargs):
            invocaciones.append(nombre)
            raise AssertionError(
                f"/me/result intentó invocar la capa IA: {nombre}"
            )

        return fallar

    monkeypatch.setattr(
        AIOrchestrator,
        "generar_recomendacion",
        trampa("AIOrchestrator.generar_recomendacion"),
    )
    monkeypatch.setattr(
        RecommendationService, "obtener", trampa("RecommendationService.obtener")
    )
    monkeypatch.setattr(GroqProveedor, "generar", trampa("GroqProveedor.generar"))
    monkeypatch.setattr(GeminiProveedor, "generar", trampa("GeminiProveedor.generar"))
    monkeypatch.setattr(
        GeminiProveedor, "interpretar", trampa("GeminiProveedor.interpretar")
    )
    return invocaciones


@pytest.fixture()
def token_empleado(client, cuenta_empleado):
    return login_y_token(client, "empleado@empresa.dev")


@pytest.fixture()
def token_rh(client, cuenta_rh):
    return login_y_token(client, "rh@empresa.dev")


def sembrar(db, empleado, *, verdaderos=3, participaciones=3, prefijo="M71"):
    """Evidencias controladas (mismo perfil que test_resultado_actual_rh).

    Con 3 participaciones y proyectos COMPLETADO el perfil esperado es
    [5, 5, 5, 5, 3]; con ``participaciones=0`` todo queda en DI.
    """
    for i in range(participaciones):
        proyecto = Proyecto(
            nombre=f"{prefijo}-{empleado.id}-P{i}",
            nombre_normalizado=f"{prefijo.lower()}-{empleado.id}-p{i}",
            estado="COMPLETADO",
        )
        db.add(proyecto)
        db.flush()
        db.add(
            Participacion(
                empleado_id=empleado.id,
                proyecto_id=proyecto.id,
                rol=f"ROL{i}",
                en_equipo=i < verdaderos,
                coordino_tareas=i < verdaderos,
                explico_a_publico_distinto=i < verdaderos,
                horas=10,
                fecha_registro=date(ANIO, 1, 15),
            )
        )
    db.commit()


def competencia(datos, clave):
    return next(c for c in datos["competencias"] if c["clave"] == clave)


class TestAcceso:
    """RBAC y ownership por token (ET §31/§32)."""

    def test_empleado_autenticado_200(self, client, token_empleado):
        respuesta = client.get(URL_ME_RESULTADO, headers=cabecera(token_empleado))
        assert respuesta.status_code == 200
        assert respuesta.json()["empleado_id"] is not None

    def test_sin_token_401(self, client):
        assert client.get(URL_ME_RESULTADO).status_code == 401

    def test_rh_recibe_403(self, client, token_rh):
        assert (
            client.get(URL_ME_RESULTADO, headers=cabecera(token_rh)).status_code
            == 403
        )

    def test_resultado_pertenece_al_empleado_autenticado(
        self, client, token_empleado, cuenta_empleado
    ):
        datos = client.get(
            URL_ME_RESULTADO, headers=cabecera(token_empleado)
        ).json()
        assert datos["empleado_id"] == cuenta_empleado.empleado_id

    def test_identidad_derivada_del_token_no_del_cliente(
        self, client, db, token_empleado, cuenta_empleado
    ):
        """Dos empleados con resultados OPUESTOS: A solo ve lo suyo (§32).

        No se construye una URL con el id de B porque ``/me/result`` no acepta
        identificadores: la prueba demuestra que, sin ninguna pista del cliente,
        la respuesta es SIEMPRE la de A, nunca la de B.
        """
        empleado_a = db.get(Empleado, cuenta_empleado.empleado_id)
        sembrar(db, empleado_a, verdaderos=3, prefijo="A")  # perfil [5,5,5,5,3]

        empleado_b = crear_empleado(db, nombre="Empleado B")
        crear_cuenta(
            db, rol="EMPLEADO", email="b@empresa.dev", empleado=empleado_b
        )
        # B con ``verdaderos=0``: sus tres competencias booleanas quedan en nivel 1
        # (0 de 3), frente a las de A en nivel 5 (3 de 3): resultado opuesto.
        sembrar(db, empleado_b, verdaderos=0, prefijo="B")

        oficial_b = CompetencyEngine(db).calculate(empleado_b.id)
        respuesta = client.get(URL_ME_RESULTADO, headers=cabecera(token_empleado))
        datos = respuesta.json()

        assert respuesta.status_code == 200
        assert datos["empleado_id"] == empleado_a.id
        assert datos["empleado_id"] != empleado_b.id
        # Los datos SON los de A, campo por campo.
        assert datos == json.loads(
            CompetencyEngine(db).calculate(empleado_a.id).model_dump_json()
        )
        # Y explícitamente NO los de B: niveles y fortalezas son opuestos.
        assert [c.nivel for c in oficial_b.competencias] == [5, 1, 1, 1, 3]
        assert [c["nivel"] for c in datos["competencias"]] == [5, 5, 5, 5, 3]
        assert [c.value for c in oficial_b.fortalezas] == ["desempeno_tecnico"]
        assert [c.value for c in oficial_b.oportunidades] == [
            "liderazgo",
            "trabajo_equipo",
            "comunicacion",
        ]
        assert datos["fortalezas"] == [
            "desempeno_tecnico",
            "liderazgo",
            "trabajo_equipo",
            "comunicacion",
        ]
        assert datos["oportunidades"] == []


class TestSinIdentificadorDelCliente:
    """El cliente NUNCA decide a qué empleado consulta (§32)."""

    def test_query_empleado_id_no_cambia_el_resultado(
        self, client, token_empleado, cuenta_empleado
    ):
        datos = client.get(
            f"{URL_ME_RESULTADO}?empleado_id=9999",
            headers=cabecera(token_empleado),
        )
        assert datos.status_code == 200
        assert datos.json()["empleado_id"] == cuenta_empleado.empleado_id

    def test_body_empleado_id_no_cambia_el_resultado(
        self, client, token_empleado, cuenta_empleado
    ):
        respuesta = client.request(
            "GET",
            URL_ME_RESULTADO,
            json={"empleado_id": 9999},
            headers=cabecera(token_empleado),
        )
        assert respuesta.status_code == 200
        assert respuesta.json()["empleado_id"] == cuenta_empleado.empleado_id

    def test_path_empleado_id_no_existente_404(self, client, token_empleado):
        """No existe ruta con ``empleado_id``: /me/result/{id} responde 404."""
        respuesta = client.get(
            f"{URL_ME_RESULTADO}/9999", headers=cabecera(token_empleado)
        )
        assert respuesta.status_code == 404


class TestContrato:
    """Contrato exacto del ResultadoActualDTO (ET §13–§19, §36)."""

    def test_cinco_competencias_oficiales_en_orden(
        self, client, token_empleado, db, cuenta_empleado
    ):
        empleado = db.get(Empleado, cuenta_empleado.empleado_id)
        sembrar(db, empleado, verdaderos=3)
        datos = client.get(
            URL_ME_RESULTADO, headers=cabecera(token_empleado)
        ).json()
        assert tuple(c["clave"] for c in datos["competencias"]) == CLAVES

    def test_calcuable_con_nivel_y_etiqueta_oficiales(
        self, client, token_empleado, db, cuenta_empleado
    ):
        empleado = db.get(Empleado, cuenta_empleado.empleado_id)
        sembrar(db, empleado, verdaderos=3)
        datos = client.get(
            URL_ME_RESULTADO, headers=cabecera(token_empleado)
        ).json()

        tecnico = competencia(datos, "desempeno_tecnico")
        assert tecnico["estado"] == CALCULABLE
        assert tecnico["nivel"] == 5
        assert tecnico["etiqueta"] == ETIQUETAS[5]
        assert tecnico["valor"] is not None
        assert isinstance(tecnico["evidencia"], dict) and tecnico["evidencia"]

        aprendizaje = competencia(datos, "aprendizaje")
        assert aprendizaje["nivel"] == 3
        assert aprendizaje["etiqueta"] == ETIQUETAS[3]

    def test_insufficient_data_con_nivel_null(
        self, client, token_empleado
    ):
        """Sin evidencia suficiente: DI con ``nivel`` en ``None`` (§14, jamás 0)."""
        datos = client.get(
            URL_ME_RESULTADO, headers=cabecera(token_empleado)
        ).json()
        for clave in CLAVES:
            c = competencia(datos, clave)
            assert c["estado"] == DI
            assert c["nivel"] is None
            assert c["etiqueta"] is None


    def test_etiquetas_oficiales_coherentes_con_el_nivel(
        self, client, token_empleado, db, cuenta_empleado
    ):
        """El diccionario único de etiquetas (PRD §14) llega tal cual."""
        empleado = db.get(Empleado, cuenta_empleado.empleado_id)
        sembrar(db, empleado, verdaderos=3)
        datos = client.get(
            URL_ME_RESULTADO, headers=cabecera(token_empleado)
        ).json()
        for c in datos["competencias"]:
            if c["nivel"] is None:
                assert c["etiqueta"] is None
            else:
                assert c["etiqueta"] == ETIQUETAS[c["nivel"]]

    def test_fortalezas_y_oportunidades_igual_al_engine(
        self, client, token_empleado, db, cuenta_empleado
    ):
        """La respuesta es EXACTAMENTE lo que calcula el CompetencyEngine."""
        empleado = db.get(Empleado, cuenta_empleado.empleado_id)
        sembrar(db, empleado, verdaderos=3)
        oficial = CompetencyEngine(db).calculate(cuenta_empleado.empleado_id)

        datos = client.get(
            URL_ME_RESULTADO, headers=cabecera(token_empleado)
        ).json()
        assert datos["fortalezas"] == [c.value for c in oficial.fortalezas]
        assert datos["oportunidades"] == [c.value for c in oficial.oportunidades]
        # Perfil [5,5,5,5,3]: cuatro fortalezas (nivel 4-5), sin oportunidades.
        assert len(datos["fortalezas"]) == 4
        assert datos["oportunidades"] == []

    def test_experiencia_es_contexto_no_competencia(
        self, client, token_empleado, db, cuenta_empleado
    ):
        empleado = db.get(Empleado, cuenta_empleado.empleado_id)
        empleado.fecha_ingreso = fecha_negocio_hoy() - timedelta(days=730)
        sembrar(db, empleado, verdaderos=3)
        datos = client.get(
            URL_ME_RESULTADO, headers=cabecera(token_empleado)
        ).json()

        assert "experiencia" in datos
        assert datos["experiencia"]["proyectos_unicos"] == 3
        assert datos["experiencia"]["anios_antiguedad"] is not None
        # Experiencia NO es competencia: siguen siendo exactamente cinco.
        assert tuple(c["clave"] for c in datos["competencias"]) == CLAVES

    def test_sin_campos_prohibidos(self, client, token_empleado):
        """Ni score global, ni promedio, ni ranking, ni 9-Box, ni IA."""
        datos = client.get(
            URL_ME_RESULTADO, headers=cabecera(token_empleado)
        ).json()
        assert set(datos) == {
            "empleado_id",
            "competencias",
            "experiencia",
            "fortalezas",
            "oportunidades",
        }
        texto = str(datos).lower()
        for prohibido in (
            "score",
            "promedio",
            "ranking",
            "nine",
            "recommendation",
            "recomendacion_ia",
        ):
            assert prohibido not in texto


class TestSinCapaIA:
    """La lectura oficial NO invoca ninguna capa de IA (§31, ET §37–§38).

    ``_prohibir_ia`` sustituye cada punto de entrada de la IA por una trampa
    que lanza ``AssertionError``: si ``/me/result`` conectara con Groq, Gemini,
    ``AIOrchestrator`` o ``RecommendationService``, el test falla.
    """

    def test_no_invoca_ia_aunque_se_siembre_evidencia(
        self, client, db, token_empleado, cuenta_empleado, monkeypatch
    ):
        invocaciones = _prohibir_ia(monkeypatch)
        empleado = db.get(Empleado, cuenta_empleado.empleado_id)
        sembrar(db, empleado, verdaderos=3)

        respuesta = client.get(URL_ME_RESULTADO, headers=cabecera(token_empleado))

        assert respuesta.status_code == 200, respuesta.text
        assert respuesta.json()["empleado_id"] == empleado.id
        assert invocaciones == []  # ningún punto de entrada de IA fue invocado

    def test_ruta_ia_existente_conserva_su_contrato(
        self, client, db, token_empleado, cuenta_empleado, monkeypatch
    ):
        """``/me/progress/recommendation`` sigue siendo la única ruta con IA.

        MB-7-1 no la toca: con un proveedor falso, la ruta de IA sigue
        devolviendo su bloque ``recomendacion_ia`` y su
        ``resultado_actual`` idéntico al de ``/me/result``.
        """
        empleado = db.get(Empleado, cuenta_empleado.empleado_id)
        sembrar(db, empleado, verdaderos=3)

        # 1) ``/me/result`` con TODA la capa IA infestada: no debe fallar.
        invocaciones = _prohibir_ia(monkeypatch)
        oficial = client.get(URL_ME_RESULTADO, headers=cabecera(token_empleado)).json()
        assert invocaciones == []

        # 2) Se levanta la veda SOLO para esta ruta, que sí usa IA por diseño.
        monkeypatch.undo()
        monkeypatch.setattr(
            modulo_progress,
            "construir_orchestrator",
            lambda: AIOrchestrator([ProveedorFalso()]),
        )
        con_ia = client.get(
            URL_ME_RECOMENDACION, headers=cabecera(token_empleado)
        ).json()

        assert con_ia["recomendacion_ia"]["proveedor"] == "groq"
        # El bloque oficial es el MISMO: no hay segunda fórmula ni segunda ruta.
        assert con_ia["resultado_actual"] == oficial


class TestDerivadaYNoPersistente:
    """Lectura derivada: cero escrituras y respuesta determinista (§18)."""

    TABLAS = (
        "cuentas_acceso",
        "empleados",
        "proyectos",
        "participaciones",
        "capacitaciones",
        "evaluaciones",
        "tokens_recuperacion",
        "auditorias_modificacion",
    )

    def _conteos(self, db):
        return {
            tabla: db.execute(text(f"SELECT count(*) FROM {tabla}")).scalar()
            for tabla in self.TABLAS
        }

    def test_cero_persistencia(self, client, db, token_empleado, cuenta_empleado):
        empleado = db.get(Empleado, cuenta_empleado.empleado_id)
        sembrar(db, empleado, verdaderos=3)
        antes = self._conteos(db)

        primera = client.get(URL_ME_RESULTADO, headers=cabecera(token_empleado))
        segunda = client.get(URL_ME_RESULTADO, headers=cabecera(token_empleado))

        assert primera.status_code == segunda.status_code == 200
        assert antes == self._conteos(db)  # cero escrituras, sin tabla nueva
        assert primera.json() == segunda.json()  # lectura determinista

