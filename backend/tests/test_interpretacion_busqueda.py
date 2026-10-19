"""Tests de la interpretación de búsqueda con lenguaje natural (Fase 8).

Especificación §27, PRD §13.3/§17.3. Los proveedores son FALSOS (mocks):
la suite no requiere claves reales. Se cubren: interpretaciones válidas
(una y varias competencias, min_level), validación estricta de la salida
del modelo (JSON inválido, códigos desconocidos, niveles fuera de rango,
campos prohibidos), fallback Groq → Gemini, error controlado, privacidad
del prompt (sin PII/contexto de empleados), contrato de entrada, RBAC,
ausencia de side effects y pasaje directo a TalentSearchService.
"""

import json

import pytest

import app.api.rh_talent_search as modulo_router
from app.services.ai.ai_orchestrator import (
    AIOrchestrator,
    validar_salida_proveedor,
)
from app.services.ai.proveedores import ErrorProveedor, _texto_crudo
from tests.helpers import (
    URL_RH_BUSQUEDA_MANUAL,
    URL_RH_INTERPRETAR_BUSQUEDA,
    cabecera,
    crear_empleado,
    login_y_token,
)

CONSULTA = "Necesito personas con liderazgo y trabajo en equipo fuertes"

SALIDA_VALIDA_UNA = json.dumps(
    {"competencies": [{"code": "liderazgo", "min_level": 4}], "area": None, "position": None}
)
SALIDA_VALIDA_VARIAS = json.dumps(
    {
        "competencies": [
            {"code": "liderazgo", "min_level": 4},
            {"code": "trabajo_equipo", "min_level": 4},
        ],
        "area": None,
        "position": None,
    }
)


class ProveedorFalso:
    """Mock de proveedor: registra prompts; devuelve respuesta o falla."""

    def __init__(self, nombre, respuesta=None, fallar=False):
        self.nombre = nombre
        self.respuesta = respuesta
        self.fallar = fallar
        self.prompts = []

    def interpretar(self, prompt):
        self.prompts.append(prompt)
        if self.fallar:
            raise ErrorProveedor(f"{self.nombre} simulado caído")
        return self.respuesta


@pytest.fixture()
def token_rh(client, cuenta_rh):
    return login_y_token(client, "rh@empresa.dev")


@pytest.fixture()
def token_empleado(client, cuenta_empleado):
    return login_y_token(client, "empleado@empresa.dev")


def parchear_orchestrator(monkeypatch, *proveedores):
    """Sustituye la fábrica del router por un orquestador con mocks."""
    orchestrator = AIOrchestrator(list(proveedores))
    monkeypatch.setattr(
        modulo_router, "construir_orchestrator", lambda: orchestrator
    )
    return orchestrator


def interpretar(client, token, cuerpo=None):
    return client.post(
        URL_RH_INTERPRETAR_BUSQUEDA,
        json=cuerpo if cuerpo is not None else {"query_text": CONSULTA},
        headers=cabecera(token),
    )


class TestValidarSalidaProveedor:
    """Validación única de salida del proveedor (§27.2). Tests 4–11."""

    def test_json_valido(self):
        criterios = validar_salida_proveedor(SALIDA_VALIDA_VARIAS)
        assert [c.code.value for c in criterios.competencies] == [
            "liderazgo",
            "trabajo_equipo",
        ]

    @pytest.mark.parametrize(
        "crudo",
        [
            "no soy json",
            "[1, 2, 3]",  # JSON válido pero no objeto
            '{"competencies": []}',  # sin criterios
            '{"competencies": [{"code": "innovacion", "min_level": 4}]}',
            '{"competencies": [{"code": "liderazgo", "min_level": 0}]}',
            '{"competencies": [{"code": "liderazgo", "min_level": 6}]}',
            '{"competencies": [{"code": "liderazgo", "min_level": 4.5}]}',
        ],
    )
    def test_salidas_invalidas(self, crudo):
        with pytest.raises(ValueError):
            validar_salida_proveedor(crudo)

    @pytest.mark.parametrize(
        "campo_prohibido,valor",
        [
            ("employee_id", 7),
            ("candidate_names", ["Ana"]),
            ("winner", "Ana"),
            ("recommended_employee", "Ana"),
            ("talent_score", 4.9),
            ("reason_for_selection", "porque sí"),
        ],
    )
    def test_campos_prohibidos_rechazados(self, campo_prohibido, valor):
        crudo = json.dumps(
            {
                "competencies": [{"code": "liderazgo", "min_level": 4}],
                "area": None,
                "position": None,
                campo_prohibido: valor,
            }
        )
        with pytest.raises(ValueError):
            validar_salida_proveedor(crudo)


class TestInterpretacionesValidas:
    """Endpoint con proveedor válido. Tests 1–3."""

    def test_una_competencia(self, client, token_rh, monkeypatch):
        parchear_orchestrator(monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA_UNA))
        respuesta = interpretar(client, token_rh)
        assert respuesta.status_code == 200, respuesta.text
        datos = respuesta.json()
        assert datos["proveedor"] == "groq"
        assert datos["criterios"]["competencies"] == [
            {"code": "liderazgo", "min_level": 4}
        ]

    def test_varias_competencias(self, client, token_rh, monkeypatch):
        parchear_orchestrator(
            monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA_VARIAS)
        )
        datos = interpretar(client, token_rh).json()
        assert len(datos["criterios"]["competencies"]) == 2

    @pytest.mark.parametrize("nivel", [1, 2, 3, 4, 5])
    def test_min_level_valido_1_a_5(self, client, token_rh, monkeypatch, nivel):
        salida = json.dumps(
            {
                "competencies": [{"code": "liderazgo", "min_level": nivel}],
                "area": None,
                "position": None,
            }
        )
        parchear_orchestrator(monkeypatch, ProveedorFalso("groq", salida))
        datos = interpretar(client, token_rh).json()
        assert datos["criterios"]["competencies"][0]["min_level"] == nivel

    @pytest.mark.parametrize(
        "salida_invalida",
        [
            "no soy json",
            '{"competencies": [{"code": "innovacion", "min_level": 4}]}',
            '{"competencies": [{"code": "liderazgo", "min_level": 9}]}',
            '{"competencies": [{"code": "liderazgo", "min_level": 4}], "winner": "Ana"}',
            '{"competencies": [{"code": "liderazgo", "min_level": 4}], "employee_id": 7}',
        ],
    )
    def test_salida_invalida_gemini_responde(
        self, client, token_rh, monkeypatch, salida_invalida
    ):
        """Groq devuelve basura ⇒ el MISMO contrato valida y Gemini toma
        el relevo (tests 4–11 vía endpoint + fallback 14)."""
        parchear_orchestrator(
            monkeypatch,
            ProveedorFalso("groq", salida_invalida),
            ProveedorFalso("gemini", SALIDA_VALIDA_VARIAS),
        )
        respuesta = interpretar(client, token_rh)
        assert respuesta.status_code == 200
        assert respuesta.json()["proveedor"] == "gemini"


class TestFallbackGroqGemini:
    """Tests 13–15."""

    def test_groq_exitoso_no_usa_gemini(self, client, token_rh, monkeypatch):
        gemini = ProveedorFalso("gemini", SALIDA_VALIDA_VARIAS)
        parchear_orchestrator(
            monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA_VARIAS), gemini
        )
        respuesta = interpretar(client, token_rh)
        assert respuesta.status_code == 200
        assert respuesta.json()["proveedor"] == "groq"
        assert gemini.prompts == []  # Gemini nunca fue llamado

    def test_groq_falla_gemini_funciona(self, client, token_rh, monkeypatch):
        parchear_orchestrator(
            monkeypatch,
            ProveedorFalso("groq", fallar=True),
            ProveedorFalso("gemini", SALIDA_VALIDA_UNA),
        )
        respuesta = interpretar(client, token_rh)
        assert respuesta.status_code == 200
        assert respuesta.json()["proveedor"] == "gemini"

    def test_ambos_fallan_error_controlado(self, client, token_rh, monkeypatch):
        parchear_orchestrator(
            monkeypatch,
            ProveedorFalso("groq", fallar=True),
            ProveedorFalso("gemini", fallar=True),
        )
        respuesta = interpretar(client, token_rh)
        assert respuesta.status_code == 502
        assert "detail" in respuesta.json()
        # Nada de interpretación improvisada: sin criterios en la respuesta
        assert "criterios" not in respuesta.json()

    def test_sin_proveedores_configurados_502(self, client, token_rh, monkeypatch):
        """Sin claves (por defecto en la suite) el error es controlado."""
        parchear_orchestrator(monkeypatch)
        assert interpretar(client, token_rh).status_code == 502


class TestPrivacidad:
    """Test 16: el prompt SOLO lleva query_text + catálogo + reglas."""

    def test_prompt_sin_pii_ni_contexto(self, client, token_rh, db, monkeypatch):
        # Sembrar datos con PII real en la base: NO deben salir del sistema.
        from tests.helpers import crear_cuenta

        empleado = crear_empleado(db, nombre="Empleado Muy Secreto")
        crear_cuenta(
            db, rol="EMPLEADO", email="secreto@empresa.dev", empleado=empleado
        )

        groq = ProveedorFalso("groq", SALIDA_VALIDA_VARIAS)
        parchear_orchestrator(monkeypatch, groq)
        respuesta = interpretar(client, token_rh)
        assert respuesta.status_code == 200

        prompt = groq.prompts[0]
        assert CONSULTA in prompt  # el texto de RH sí viaja (§27.1)
        assert "Empleado Muy Secreto" not in prompt
        assert "secreto@empresa.dev" not in prompt
        # Catálogo cerrado SÍ viaja (permitido, §27.1)
        assert "liderazgo" in prompt
        assert "desempeno_tecnico" in prompt
        assert "1 y 5" in prompt  # reglas de min_level


class TestContratoEntrada:
    def test_texto_vacio_rechazado(self, client, token_rh, monkeypatch):
        parchear_orchestrator(monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA_UNA))
        assert interpretar(client, token_rh, {"query_text": "   "}).status_code == 422

    def test_texto_demasiado_largo_rechazado(self, client, token_rh, monkeypatch):
        parchear_orchestrator(monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA_UNA))
        assert interpretar(client, token_rh, {"query_text": "x" * 501}).status_code == 422

    def test_campo_arbitrario_rechazado(self, client, token_rh, monkeypatch):
        parchear_orchestrator(monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA_UNA))
        cuerpo = {"query_text": CONSULTA, "employee_id": 5}
        assert interpretar(client, token_rh, cuerpo).status_code == 422

    def test_criterios_en_entrada_rechazados(self, client, token_rh, monkeypatch):
        """La interpretación NO acepta criterios adicionales del cliente."""
        parchear_orchestrator(monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA_UNA))
        cuerpo = {
            "query_text": CONSULTA,
            "competencies": [{"code": "liderazgo", "min_level": 4}],
        }
        assert interpretar(client, token_rh, cuerpo).status_code == 422


class TestNoEjecutaBusquedaNiPersiste:
    """Tests 17 y 19: interpretar nunca busca ni escribe."""

    def test_fallo_no_ejecuta_busqueda_ni_escribe(
        self, client, token_rh, db, monkeypatch
    ):
        from sqlalchemy import text as sql_text

        tablas = (
            "cuentas_acceso", "empleados", "proyectos", "participaciones",
            "capacitaciones", "evaluaciones", "tokens_recuperacion",
            "auditorias_modificacion",
        )
        antes = {
            t: db.execute(sql_text(f"SELECT count(*) FROM {t}")).scalar()
            for t in tablas
        }
        parchear_orchestrator(
            monkeypatch,
            ProveedorFalso("groq", fallar=True),
            ProveedorFalso("gemini", fallar=True),
        )
        respuesta = interpretar(client, token_rh, {"query_text": "texto sin sentido"})
        assert respuesta.status_code == 502  # interpretación no válida: no busca
        despues = {
            t: db.execute(sql_text(f"SELECT count(*) FROM {t}")).scalar()
            for t in tablas
        }
        assert antes == despues  # cero side effects

    def test_respuesta_valida_no_contiene_resultados(
        self, client, token_rh, monkeypatch
    ):
        parchear_orchestrator(monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA_VARIAS))
        datos = interpretar(client, token_rh).json()
        assert "items" not in datos  # interpretar ≠ buscar
        assert set(datos) == {"proveedor", "criterios"}


class TestAutorizacion:
    """Test 18."""

    def test_rh_permitido(self, client, token_rh, monkeypatch):
        parchear_orchestrator(monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA_UNA))
        assert interpretar(client, token_rh).status_code == 200

    def test_empleado_rechazado_403(self, client, token_empleado):
        assert interpretar(client, token_empleado).status_code == 403

    def test_sin_token_401(self, client):
        assert client.post(
            URL_RH_INTERPRETAR_BUSQUEDA, json={"query_text": CONSULTA}
        ).status_code == 401


class TestIntegracionConBusquedaManual:
    """Test 20: interpretar → criterios consumibles por TalentSearchService."""

    def test_flujo_interpretar_revisar_buscar(self, client, token_rh, monkeypatch):
        parchear_orchestrator(monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA_VARIAS))
        interpretacion = interpretar(client, token_rh).json()

        # RH revisa y envía SOLO las competencias al contrato manual.
        cuerpo_manual = {"competencies": interpretacion["criterios"]["competencies"]}
        respuesta = client.post(
            URL_RH_BUSQUEDA_MANUAL, json=cuerpo_manual, headers=cabecera(token_rh)
        )
        assert respuesta.status_code == 200, respuesta.text
        datos = respuesta.json()
        assert datos["criterios"] == cuerpo_manual["competencies"]
        assert datos["total"] == 0  # sin empleados sembrados: lista vacía válida

    def test_area_position_no_entran_al_contrato_manual(self):
        """``area``/``position`` son informativos: TalentSearchService aún
        no los soporta y el contrato manual los rechaza (extra=forbid)."""
        from pydantic import ValidationError

        from app.schemas.talent_search import BusquedaManualIn

        with pytest.raises(ValidationError):
            BusquedaManualIn.model_validate(
                {"competencies": [{"code": "liderazgo", "min_level": 4}], "area": "TI"}
            )



class TestTextoCrudo:
    """``_texto_crudo``: cadenas y listas de partes (adaptadores LangChain).

    Una respuesta SIN texto utilizable jamás se convierte en respuesta
    válida: cadena vacía, lista vacía, partes sin texto y tipos distintos
    siguen siendo ``ErrorProveedor``.
    """

    class _ParteObjeto:
        """Parte estilo objeto LangChain con atributo ``text``."""

        def __init__(self, text):
            self.text = text

    @staticmethod
    def _mensaje(contenido):
        from types import SimpleNamespace

        return SimpleNamespace(content=contenido)

    def test_cadena_simple(self):
        assert _texto_crudo(self._mensaje("texto plano")) == "texto plano"

    def test_cadena_vacia_es_error(self):
        with pytest.raises(ErrorProveedor):
            _texto_crudo(self._mensaje("   "))

    def test_lista_una_parte_dict(self):
        contenido = [{"type": "text", "text": "OK", "extras": {}}]
        assert _texto_crudo(self._mensaje(contenido)) == "OK"

    def test_lista_mixta_extrae_solo_segmentos_de_texto(self):
        contenido = [
            {"type": "thinking", "thinking": "razonamiento interno"},
            {"type": "text", "text": "respuesta "},
            self._ParteObjeto("final"),
        ]
        assert _texto_crudo(self._mensaje(contenido)) == "respuesta final"

    def test_lista_vacia_es_error(self):
        with pytest.raises(ErrorProveedor):
            _texto_crudo(self._mensaje([]))

    def test_partes_sin_texto_utilizable_son_error(self):
        contenido = [
            {"type": "image_url", "image_url": {"url": "x"}},
            {"type": "text", "text": ""},
            self._ParteObjeto("   "),
        ]
        with pytest.raises(ErrorProveedor):
            _texto_crudo(self._mensaje(contenido))

    def test_contenido_de_otro_tipo_es_error(self):
        with pytest.raises(ErrorProveedor):
            _texto_crudo(self._mensaje(None))
