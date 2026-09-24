"""Tests de recomendaciones de desarrollo con IA (Fase 12, PRD §17–§18,
§21.2; ET §37–§38; Style Guide §17).

Proveedores FALSOS (mocks): la suite no requiere claves reales. Se cubren:
contrato cerrado del LLM (campos y longitudes), juicios prohibidos,
RBAC (Empleado 200 / RH 403 / sin token 401), derivación de empleado_id
del token (anti-IDOR e inyección), origen de datos (ResultadoActual del
engine, DI preservado, histórico no altera, datos actuales sí cambian),
privacidad del prompt (sin PII/resolvio_problema/texto libre/otros
empleados), fallback Groq → Gemini → 502, salida inválida ⇒ fallo de
proveedor, separación dato/sugerencia y cero persistencia/auditoría.
"""

import json
from datetime import date

import pytest
from sqlalchemy import text

import app.api.me_progress as modulo_router
from app.core.fechas import fecha_negocio_hoy
from app.models.evaluacion import Evaluacion
from app.models.participacion import Participacion
from app.models.proyecto import Proyecto
from app.services.ai.ai_orchestrator import validar_salida_recomendacion
from app.services.ai.proveedores import ErrorProveedor
from app.services.competency_engine import CompetencyEngine
from tests.helpers import (
    URL_ME_RECOMENDACION,
    cabecera,
    crear_empleado,
    login_y_token,
)

ANIO = fecha_negocio_hoy().year

SALIDA_VALIDA = json.dumps(
    {
        "recommendation": (
            "Una idea para el desarrollo: practicar la coordinación de "
            "tareas en proyectos pequeños puede ayudar a ampliar tu "
            "experiencia."
        ),
        "actions": [
            "Registrar participación en un proyecto pequeño coordinando tareas."
        ],
    }
)


class ProveedorFalso:
    """Mock de proveedor: registra system/prompt; responde o falla."""

    def __init__(self, nombre, respuesta=None, fallar=False):
        self.nombre = nombre
        self.respuesta = respuesta
        self.fallar = fallar
        self.prompts = []
        self.sistemas = []

    def generar(self, system, prompt):
        self.sistemas.append(system)
        self.prompts.append(prompt)
        if self.fallar:
            raise ErrorProveedor(f"{self.nombre} simulado caído")
        return self.respuesta

    def interpretar(self, prompt):  # compatibilidad con el Protocol
        return self.generar("", prompt)


@pytest.fixture()
def token_empleado(client, cuenta_empleado):
    return login_y_token(client, "empleado@empresa.dev")


@pytest.fixture()
def token_rh(client, cuenta_rh):
    return login_y_token(client, "rh@empresa.dev")


def parchear_orchestrator(monkeypatch, *proveedores):
    """Sustituye la fábrica del router por un orquestador con mocks."""
    from app.services.ai.ai_orchestrator import AIOrchestrator

    orchestrator = AIOrchestrator(list(proveedores))
    monkeypatch.setattr(
        modulo_router, "construir_orchestrator", lambda: orchestrator
    )
    return orchestrator


def sembrar(db, empleado, *, verdaderos=3, participaciones=3, prefijo="SEM"):
    """Agrega participaciones con nivel de liderazgo controlado."""
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
                entregables=f"DetalleConfidencial-{empleado.id}-{i}",
                en_equipo=i < verdaderos,
                coordino_tareas=i < verdaderos,
                explico_a_publico_distinto=i < verdaderos,
                resolvio_problema=(i % 2 == 0),
                horas=10,
                fecha_registro=date(ANIO, 1, 15),
            )
        )
    db.commit()


def consultar(client, token, **extra):
    return client.get(URL_ME_RECOMENDACION, headers=cabecera(token), **extra)


class TestContratoSalidaLLM:
    """Tests 21–25, 29–30, 23–24: contrato cerrado del LLM (ET §37)."""

    def test_salida_valida(self):
        salida = validar_salida_recomendacion(SALIDA_VALIDA)
        assert salida.recommendation
        assert len(salida.actions) == 1

    @pytest.mark.parametrize(
        "crudo",
        [
            "no soy json",
            "[1, 2, 3]",
            '{"recommendation": ""}',
            '{"recommendation": "   "}',
            '{"recommendation": "' + "x" * 501 + '"}',
            '{"recommendation": "texto", "actions": ["' + "y" * 201 + '"]}',
            '{"recommendation": "texto", "actions": ["a", ""]}',
            '{"recommendation": "texto", "actions": ['
            + ", ".join(f'"a{i}"' for i in range(6))
            + "]}",
        ],
    )
    def test_salidas_invalidas(self, crudo):
        with pytest.raises(ValueError):
            validar_salida_recomendacion(crudo)

    @pytest.mark.parametrize(
        "campo,valor",
        [
            ("employee_id", 7),
            ("name", "Alguien"),
            ("nombre", "Alguien"),
            ("winner", "Alguien"),
            ("recommended_employee", "Alguien"),
            ("talent_score", 99),
            ("score", 99),
            ("nivel", 5),
            ("competency_level", 5),
            ("box_code", "A1"),
            ("performance_axis", 3),
            ("potential_axis", 3),
            ("strengths_generated_by_ai", ["liderazgo"]),
            ("opportunities_generated_by_ai", ["liderazgo"]),
        ],
    )
    def test_campos_prohibidos_rechazados(self, campo, valor):
        crudo = json.dumps(
            {"recommendation": "texto válido", campo: valor, "actions": []}
        )
        with pytest.raises(ValueError):
            validar_salida_recomendacion(crudo)

    @pytest.mark.parametrize(
        "juicio",
        [
            "mejor empleado",
            "top talento",
            "ganador",
            "bajo potencial",
            "empleado insuficiente",
        ],
    )
    def test_juicios_prohibidos_rechazados(self, juicio):
        crudo = json.dumps({"recommendation": f"Eres el {juicio} del equipo"})
        with pytest.raises(ValueError):
            validar_salida_recomendacion(crudo)


class TestAcceso:
    """Tests 1–3, 5: RBAC y anti-IDOR."""

    def test_empleado_puede_consultar(self, client, token_empleado, monkeypatch):
        parchear_orchestrator(monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA))
        respuesta = consultar(client, token_empleado)
        assert respuesta.status_code == 200, respuesta.text

    def test_sin_token_401(self, client):
        assert client.get(URL_ME_RECOMENDACION).status_code == 401

    def test_rh_rechazado_403(self, client, token_rh):
        assert consultar(client, token_rh).status_code == 403

    def test_empleado_id_deriva_del_token(
        self, client, token_empleado, cuenta_empleado, monkeypatch
    ):
        parchear_orchestrator(monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA))
        datos = consultar(client, token_empleado).json()
        assert datos["resultado_actual"]["empleado_id"] == (
            cuenta_empleado.empleado_id
        )

    def test_inyeccion_employee_id_no_cambia_objetivo(
        self, client, token_empleado, cuenta_empleado, monkeypatch
    ):
        """Query con ``employee_id`` ajeno (y otros datos): ignorada por
        contrato; el objetivo siempre es el empleado del token."""
        parchear_orchestrator(monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA))
        respuesta = consultar(
            client,
            token_empleado,
            params={"employee_id": 9999, "niveles": "liderazgo:5"},
        )
        assert respuesta.status_code == 200, respuesta.text
        datos = respuesta.json()
        assert datos["resultado_actual"]["empleado_id"] == (
            cuenta_empleado.empleado_id
        )


class TestOrigenDatos:
    """Tests 6–11, 31–33 e inmutabilidad de bloques del sistema."""

    def test_cinco_competencias_presentes(
        self, client, token_empleado, db, cuenta_empleado, monkeypatch
    ):
        from app.models.empleado import Empleado

        empleado = db.get(Empleado, cuenta_empleado.empleado_id)
        sembrar(db, empleado, verdaderos=3)
        parchear_orchestrator(monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA))
        datos = consultar(client, token_empleado).json()
        claves = {c["clave"] for c in datos["resultado_actual"]["competencias"]}
        assert claves == {
            "desempeno_tecnico",
            "liderazgo",
            "trabajo_equipo",
            "comunicacion",
            "aprendizaje",
        }

    def test_fortalezas_y_oportunidades_coinciden_con_engine(
        self, client, token_empleado, db, cuenta_empleado, monkeypatch
    ):
        from app.models.empleado import Empleado

        empleado = db.get(Empleado, cuenta_empleado.empleado_id)
        sembrar(db, empleado, verdaderos=3)  # fortalezas; liderazgo nivel 5
        parchear_orchestrator(monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA))
        datos = consultar(client, token_empleado).json()
        actual = CompetencyEngine(db).calculate(cuenta_empleado.empleado_id)
        assert datos["resultado_actual"]["fortalezas"] == [
            clave.value for clave in actual.fortalezas
        ]
        assert datos["resultado_actual"]["oportunidades"] == [
            clave.value for clave in actual.oportunidades
        ]

    def test_di_preservado_y_no_convertido_a_cero(
        self, client, token_empleado, monkeypatch
    ):
        # Sin participaciones sembradas: todas las competencias son DI.
        parchear_orchestrator(monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA))
        datos = consultar(client, token_empleado).json()
        for competencia in datos["resultado_actual"]["competencias"]:
            assert competencia["estado"] == "INSUFFICIENT_DATA"
            assert competencia["nivel"] is None  # nunca 0

    def test_ia_no_modifica_bloques_del_sistema(
        self, client, token_empleado, db, cuenta_empleado, monkeypatch
    ):
        """La IA "opina" en texto, pero competencias y categorías siguen
        siendo exactamente las del engine (reglas §17.4)."""
        from app.models.empleado import Empleado

        empleado = db.get(Empleado, cuenta_empleado.empleado_id)
        sembrar(db, empleado, verdaderos=3)
        parchear_orchestrator(monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA))
        respuesta = consultar(client, token_empleado).json()
        actual = CompetencyEngine(db).calculate(cuenta_empleado.empleado_id)
        assert [
            (c["clave"], c["estado"], c["nivel"])
            for c in respuesta["resultado_actual"]["competencias"]
        ] == [(c.clave.value, c.estado.value, c.nivel) for c in actual.competencias]
        assert respuesta["resultado_actual"]["fortalezas"] == [
            clave.value for clave in actual.fortalezas
        ]
        assert respuesta["resultado_actual"]["oportunidades"] == [
            clave.value for clave in actual.oportunidades
        ]


class TestPrivacidadPrompt:
    """Tests 14–17: el prompt lleva SOLO el contexto mínimo (PRD §18)."""

    def test_prompt_sin_pii_ni_datos_prohibidos(
        self, client, token_empleado, db, cuenta_empleado, monkeypatch
    ):
        from app.models.empleado import Empleado

        empleado = db.get(Empleado, cuenta_empleado.empleado_id)
        empleado.nombre = "Ultraconfidencial"
        db.commit()
        sembrar(db, empleado, verdaderos=3)
        # Otro empleado con datos propios: jamás debe aparecer en el prompt.
        otro = crear_empleado(db, nombre="ColegaAjeno")
        sembrar(db, otro, verdaderos=1, prefijo="OTRO")

        espia = ProveedorFalso("groq", SALIDA_VALIDA)
        parchear_orchestrator(monkeypatch, espia)
        respuesta = consultar(client, token_empleado)
        assert respuesta.status_code == 200, respuesta.text
        prompt = espia.prompts[0].lower()
        # Las instrucciones pueden NOMBRAR campos prohibidos (regla 5,
        # ET §37); el CONTEXTO estructurado es lo que no puede llevarlos.
        contexto = prompt.split("contexto estructurado del sistema", 1)[1]

        # Sin nombre, correo ni IDs del propio empleado (PRD §18).
        assert "ultraconfidencial" not in contexto
        assert "empleado@empresa.dev" not in contexto
        assert "employee_id" not in contexto
        assert '"id"' not in contexto
        # Sin resolvio_problema ni texto libre de participaciones
        # (entregables): el contexto solo lleva niveles y estados.
        assert "resolvio" not in contexto
        assert "detalleconfidencial" not in contexto
        # Sin datos de otros empleados.
        assert "colegaajeno" not in contexto

        # El contexto SÍ lleva las cinco competencias y las categorías.
        for clave in (
            "desempeno_tecnico",
            "liderazgo",
            "trabajo_equipo",
            "comunicacion",
            "aprendizaje",
        ):
            assert clave in contexto
        assert "fortalezas" in contexto
        assert "oportunidades" in contexto
        assert "anios_antiguedad" in contexto
        assert "proyectos_unicos" in contexto


class TestDerivadaYNoPersistente:
    """Tests 12–13, 26–27: derivada del estado actual, cero escrituras."""

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

    def test_evaluacion_historica_no_altera(
        self, client, token_empleado, token_rh, db, cuenta_empleado, cuenta_rh,
        monkeypatch,
    ):
        espia = ProveedorFalso("groq", SALIDA_VALIDA)
        parchear_orchestrator(monkeypatch, espia)
        consultar(client, token_empleado)

        snapshot = {
            "periodo": "2020-Q1",
            "generado_por_cuenta_id": cuenta_rh.id,
        }
        for codigo in (
            "desempeno_tecnico",
            "liderazgo",
            "trabajo_equipo",
            "comunicacion",
            "aprendizaje",
        ):
            snapshot[f"{codigo}_nivel"] = 5
            snapshot[f"{codigo}_status"] = "CALCULABLE"
        db.add(Evaluacion(empleado_id=cuenta_empleado.empleado_id, **snapshot))
        db.commit()

        consultar(client, token_empleado)
        assert espia.prompts[0] == espia.prompts[1]  # contexto idéntico

    def test_cambio_de_datos_actuales_cambia_contexto(
        self, client, token_empleado, db, cuenta_empleado, monkeypatch
    ):
        from app.models.empleado import Empleado

        espia = ProveedorFalso("groq", SALIDA_VALIDA)
        parchear_orchestrator(monkeypatch, espia)
        consultar(client, token_empleado)
        assert "insufficient_data" in espia.prompts[0].lower()

        empleado = db.get(Empleado, cuenta_empleado.empleado_id)
        sembrar(db, empleado, verdaderos=3)
        consultar(client, token_empleado)
        assert espia.prompts[0] != espia.prompts[1]  # contexto nuevo

    def test_cero_persistencia_ni_auditoria(
        self, client, token_empleado, monkeypatch, db
    ):
        parchear_orchestrator(monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA))
        antes = self._conteos(db)
        primera = consultar(client, token_empleado)
        segunda = consultar(client, token_empleado)
        assert primera.status_code == segunda.status_code == 200
        assert antes == self._conteos(db)  # cero escrituras, sin auditoría


class TestProveedoresYFallback:
    """Tests 18–21: Groq → Gemini → 502; salida inválida = fallo."""

    def test_groq_exitoso(self, client, token_empleado, monkeypatch):
        parchear_orchestrator(monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA))
        datos = consultar(client, token_empleado).json()
        assert datos["recomendacion_ia"]["proveedor"] == "groq"

    def test_groq_falla_gemini_funciona(self, client, token_empleado, monkeypatch):
        parchear_orchestrator(
            monkeypatch,
            ProveedorFalso("groq", fallar=True),
            ProveedorFalso("gemini", SALIDA_VALIDA),
        )
        datos = consultar(client, token_empleado).json()
        assert datos["recomendacion_ia"]["proveedor"] == "gemini"

    def test_ambos_fallan_502(self, client, token_empleado, monkeypatch):
        parchear_orchestrator(
            monkeypatch,
            ProveedorFalso("groq", fallar=True),
            ProveedorFalso("gemini", fallar=True),
        )
        respuesta = consultar(client, token_empleado)
        assert respuesta.status_code == 502
        detalle = respuesta.json()["detail"].lower()
        # Sin stack traces, clases ni detalles internos de proveedores.
        assert "proveedor" in detalle or "recomendación" in detalle
        assert "traceback" not in detalle
        assert "exception" not in detalle

    def test_json_invalido_de_groq_cae_a_gemini(
        self, client, token_empleado, monkeypatch
    ):
        parchear_orchestrator(
            monkeypatch,
            ProveedorFalso("groq", "no soy json"),
            ProveedorFalso("gemini", SALIDA_VALIDA),
        )
        datos = consultar(client, token_empleado).json()
        assert datos["recomendacion_ia"]["proveedor"] == "gemini"

    def test_salida_invalida_de_gemini_502(
        self, client, token_empleado, monkeypatch
    ):
        parchear_orchestrator(
            monkeypatch,
            ProveedorFalso("groq", fallar=True),
            ProveedorFalso("gemini", '{"winner": "alguien"}'),
        )
        assert consultar(client, token_empleado).status_code == 502

    def test_sin_claves_configuradas_502_sin_inventar(self, client, token_empleado):
        """Fábrica real sin claves (entorno de tests): 502 controlado.
        Nunca se hardcodea una recomendación sustituta."""
        respuesta = consultar(client, token_empleado)
        assert respuesta.status_code == 502


class TestSeparacionDatoSugerencia:
    """Test 28, 31–33: bloques separados, sin selección/ranking/score."""

    def test_estructura_y_procedencia(self, client, token_empleado, monkeypatch):
        parchear_orchestrator(monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA))
        datos = consultar(client, token_empleado).json()
        assert set(datos) == {"resultado_actual", "recomendacion_ia"}
        bloque_ia = datos["recomendacion_ia"]
        assert set(bloque_ia) == {
            "origen",
            "proveedor",
            "recommendation",
            "actions",
        }
        assert bloque_ia["origen"] == "IA"  # procedencia explícita
        assert set(datos["resultado_actual"]) == {
            "empleado_id",
            "competencias",
            "experiencia",
            "fortalezas",
            "oportunidades",
        }
        # El texto IA NO vive dentro del bloque de datos del sistema.
        assert bloque_ia["recommendation"]
        assert bloque_ia["actions"]

    def test_sin_seleccion_ranking_ni_score_global(
        self, client, token_empleado, monkeypatch
    ):
        parchear_orchestrator(monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA))
        texto = str(consultar(client, token_empleado).json()).lower()
        for prohibido in (
            "winner",
            "ganador",
            "ranking",
            "talent_score",
            "score_global",
            "recommended_employee",
            "nine_box",
            "box_code",
        ):
            assert prohibido not in texto, prohibido

