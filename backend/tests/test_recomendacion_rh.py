"""Tests de la recomendación de desarrollo para RH (PRD v1.4 §20.2.1;
ET v1.6 §31.1, §39.7).

Endpoint: ``GET /api/v1/rh/employees/{empleado_id}/recommendation``.

Cubre: RBAC (401 sin token, 403 Empleado, 200 RH), 404 si el empleado
no existe, elegibilidad idéntica a ``/result`` (inactivos incluidos),
contrato ``{ resultado_actual, recomendacion_ia }`` reutilizado,
degradación a ``recomendacion_ia: null`` cuando la IA no está
disponible, ausencia de PII en el prompt, cero persistencia/auditoría y
conservación de ``GET /me/progress/recommendation`` como exclusivo del
empleado (RH → 403).

Proveedores FALSOS (mocks): la suite no requiere claves reales ni hace
llamadas de red.
"""

import json
from datetime import date

import pytest
from sqlalchemy import text

import app.api.rh_empleados as modulo_router_rh
from app.core.fechas import fecha_negocio_hoy
from app.models.participacion import Participacion
from app.models.proyecto import Proyecto
from tests.helpers import (
    URL_ME_RECOMENDACION,
    URL_RH_EMPLEADO_RECOMENDACION,
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

    def generar(self, system, prompt):
        from app.services.ai.proveedores import ErrorProveedor

        self.prompts.append(prompt)
        if self.fallar:
            raise ErrorProveedor(f"{self.nombre} simulado caído")
        return self.respuesta

    def interpretar(self, prompt):  # compatibilidad con el Protocol
        return self.generar("", prompt)


def parchear_orchestrator_rh(monkeypatch, *proveedores):
    """Sustituye la fábrica del router RH por un orquestador con mocks."""
    from app.services.ai.ai_orchestrator import AIOrchestrator

    orchestrator = AIOrchestrator(list(proveedores))
    monkeypatch.setattr(
        modulo_router_rh, "construir_orchestrator", lambda: orchestrator
    )
    return orchestrator


def sembrar(db, nombre, *, verdaderos=3, participaciones=3, activo=True):
    """Empleado con evidencias controladas (perfil [5,5,5,5,3] por defecto)."""
    empleado = crear_empleado(db, nombre=nombre)
    empleado.activo = activo
    for i in range(participaciones):
        proyecto = Proyecto(
            nombre=f"{nombre}-{empleado.id}-P{i}",
            nombre_normalizado=f"{nombre.lower()}-{empleado.id}-p{i}",
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
    return empleado


def url_recomendacion(empleado_id):
    return URL_RH_EMPLEADO_RECOMENDACION.format(empleado_id=empleado_id)


def pedir(client, token, empleado_id):
    return client.get(url_recomendacion(empleado_id), headers=cabecera(token))


def _conteos(db):
    tablas = (
        "empleados",
        "cuentas_acceso",
        "proyectos",
        "participaciones",
        "capacitaciones",
        "evaluaciones",
        "auditorias_modificacion",
    )
    return {
        tabla: db.execute(text(f"SELECT COUNT(*) FROM {tabla}")).scalar()
        for tabla in tablas
    }


@pytest.fixture()
def token_rh(client, cuenta_rh):
    return login_y_token(client, "rh@empresa.dev")


@pytest.fixture()
def token_empleado(client, cuenta_empleado):
    return login_y_token(client, "empleado@empresa.dev")


class TestAcceso:
    """RBAC y recurso inexistente (ET §31/§39.7)."""

    def test_rh_autorizado_contrato(self, client, token_rh, db, monkeypatch):
        empleado = sembrar(db, "Autorizado")
        parchear_orchestrator_rh(
            monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA)
        )
        respuesta = pedir(client, token_rh, empleado.id)
        assert respuesta.status_code == 200, respuesta.text
        datos = respuesta.json()
        assert set(datos) == {"resultado_actual", "recomendacion_ia"}
        assert datos["resultado_actual"]["empleado_id"] == empleado.id
        assert len(datos["resultado_actual"]["competencias"]) == 5
        bloque = datos["recomendacion_ia"]
        assert bloque["origen"] == "IA"
        assert bloque["proveedor"] == "groq"
        assert bloque["recommendation"]
        assert bloque["actions"]

    def test_empleado_rechazado_403(self, client, token_empleado, db):
        empleado = sembrar(db, "Denegado")
        assert pedir(client, token_empleado, empleado.id).status_code == 403

    def test_sin_token_401(self, client, db):
        empleado = sembrar(db, "Anonimo")
        assert client.get(url_recomendacion(empleado.id)).status_code == 401

    def test_empleado_inexistente_404(self, client, token_rh):
        respuesta = pedir(client, token_rh, 99999)
        assert respuesta.status_code == 404
        assert "Empleado no encontrado" in respuesta.json()["detail"]

    def test_empleado_inactivo_misma_elegibilidad(
        self, client, token_rh, db, monkeypatch
    ):
        """Sin restricción exclusiva por estado activo (PRD v1.4 §20.2.1)."""
        empleado = sembrar(db, "Inactivo", activo=False)
        parchear_orchestrator_rh(
            monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA)
        )
        respuesta = pedir(client, token_rh, empleado.id)
        assert respuesta.status_code == 200, respuesta.text
        assert respuesta.json()["resultado_actual"]["empleado_id"] == empleado.id


class TestDegradacion:
    """IA no disponible: 200 con resultado intacto y bloque en null."""

    def test_ia_no_disponible_bloque_null(self, client, token_rh, db):
        empleado = sembrar(db, "SinIA")
        # Sin proveedores: la fábrica real (claves anuladas en conftest)
        # produce el 502 interno que el servicio degrada a null.
        datos = pedir(client, token_rh, empleado.id).json()
        assert len(datos["resultado_actual"]["competencias"]) == 5
        assert datos["recomendacion_ia"] is None

    def test_todos_caidos_bloque_null(self, client, token_rh, db, monkeypatch):
        empleado = sembrar(db, "Caidos")
        parchear_orchestrator_rh(
            monkeypatch,
            ProveedorFalso("groq", fallar=True),
            ProveedorFalso("gemini", fallar=True),
        )
        respuesta = pedir(client, token_rh, empleado.id)
        assert respuesta.status_code == 200, respuesta.text
        datos = respuesta.json()
        assert len(datos["resultado_actual"]["competencias"]) == 5
        assert datos["recomendacion_ia"] is None


class TestContratoYPrivacidad:
    """Contrato cerrado, sin PII al LLM, sin campos adicionales."""

    def test_sin_campos_adicionales(self, client, token_rh, db, monkeypatch):
        empleado = sembrar(db, "Cerrado")
        parchear_orchestrator_rh(
            monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA)
        )
        datos = pedir(client, token_rh, empleado.id).json()
        assert set(datos) == {"resultado_actual", "recomendacion_ia"}
        assert set(datos["recomendacion_ia"]) == {
            "origen",
            "proveedor",
            "recommendation",
            "actions",
        }
        assert set(datos["resultado_actual"]) == {
            "empleado_id",
            "competencias",
            "fortalezas",
            "oportunidades",
            "experiencia",
        }

    def test_prompt_sin_pii_ni_ids(self, client, token_rh, db, monkeypatch):
        empleado = sembrar(db, "Privado", verdaderos=1)
        espia = ProveedorFalso("groq", SALIDA_VALIDA)
        parchear_orchestrator_rh(monkeypatch, espia)
        pedir(client, token_rh, empleado.id)
        contexto = espia.prompts[0].split(
            "Contexto estructurado del sistema", 1
        )[1]
        assert str(empleado.id) not in contexto
        assert "Privado" not in espia.prompts[0]
        assert "resolvio_problema" not in contexto


class TestDerivadaYNoPersistente:
    """Cero escrituras, sin auditoría, sin caché: cada consulta deriva."""

    def test_cero_escrituras_ni_auditoria(
        self, client, token_rh, db, monkeypatch
    ):
        empleado = sembrar(db, "Efimera")
        parchear_orchestrator_rh(
            monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA)
        )
        antes = _conteos(db)
        primera = pedir(client, token_rh, empleado.id)
        segunda = pedir(client, token_rh, empleado.id)
        assert primera.status_code == segunda.status_code == 200
        assert antes == _conteos(db)  # cero escrituras, sin auditoría


class TestRutaEmpleadoIntacta:
    """GET /me/... sigue exclusivo del empleado (RH → 403)."""

    def test_me_rechaza_rh_403(self, client, token_rh):
        respuesta = client.get(URL_ME_RECOMENDACION, headers=cabecera(token_rh))
        assert respuesta.status_code == 403

    def test_ruta_rh_rechaza_empleado_403(
        self, client, token_empleado, db, monkeypatch
    ):
        empleado = sembrar(db, "Ajeno")
        parchear_orchestrator_rh(
            monkeypatch, ProveedorFalso("groq", SALIDA_VALIDA)
        )
        assert pedir(client, token_empleado, empleado.id).status_code == 403



