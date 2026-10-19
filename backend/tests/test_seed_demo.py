"""Pruebas del seed de datos sintéticos de demostración (Fase C2).

Corren contra la base aislada ``talento_test`` (el ``conftest`` trunca todas
las tablas antes y después de cada test): nunca tocan la base de desarrollo
ni crean ninguna base nueva. Las barreras de ``ejecutar()`` que no requieren
conexión se prueban a nivel de URL/entorno, sin abrir engine.
"""

from datetime import date

import pytest
from sqlalchemy import func, select

from app.core import seed_demo
from app.core.normalizacion import normalizar_nombre
from app.core.security import verificar_password
from app.models.auditoria_modificacion import AuditoriaModificacion
from app.models.capacitacion import Capacitacion
from app.models.cuenta_acceso import CuentaAcceso
from app.models.empleado import Empleado
from app.models.evaluacion import Evaluacion
from app.models.participacion import Participacion
from app.models.proyecto import Proyecto
from app.core.fechas import periodo_actual
from tests.helpers import crear_cuenta, crear_empleado

URL_LOGIN = "/api/v1/auth/login"


class TestBarrerasDeEntorno:
    def test_rechaza_entorno_de_produccion(self, monkeypatch):
        monkeypatch.setenv("APP_ENV", "production")
        with pytest.raises(seed_demo.EntornoDeProduccion):
            seed_demo.ejecutar(confirmado=True)

    def test_rechaza_base_que_no_cumple_la_convencion_demo(self):
        for url in (
            "postgresql+psycopg2://u:c@localhost:5433/talento_alto_potencial",
            "postgresql+psycopg2://u:c@localhost:5433/talento_test",
            "postgresql+psycopg2://u:c@localhost:5433/produccion",
        ):
            with pytest.raises(seed_demo.BaseNoDestinadaADemo):
                seed_demo.ejecutar(url, confirmado=True)

    def test_rechaza_url_vacia_o_sin_base(self):
        for url in ("", "   "):
            with pytest.raises(seed_demo.BaseNoDestinadaADemo):
                seed_demo.ejecutar(url, confirmado=True)

    def test_acepta_nombres_de_la_convencion_demo(self):
        assert seed_demo.es_base_de_demostracion("talento_demo")
        assert seed_demo.es_base_de_demostracion("talento_demo_evaluacion")
        assert not seed_demo.es_base_de_demostracion("talento_alto_potencial")
        assert not seed_demo.es_base_de_demostracion("talento_demox")


class TestBarrerasDeContenido:
    def test_exige_confirmacion_explicita(self, db):
        with pytest.raises(seed_demo.ConfirmacionFaltante):
            seed_demo.cargar(db, confirmado=False)
        assert (db.scalar(select(func.count()).select_from(CuentaAcceso)) or 0) == 0

    def test_base_vacia_se_clasifica_como_tal(self, db):
        assert seed_demo.evaluar_estado(db) == "vacia"

    def test_datos_ajenos_abortan_sin_modificar(self, db):
        cuenta = crear_cuenta(db, rol="RH", email="externo@empresa.dev")
        with pytest.raises(seed_demo.BaseConDatosAjenos):
            seed_demo.cargar(db, confirmado=True)
        restantes = db.scalars(select(CuentaAcceso)).all()
        assert [c.email for c in restantes] == [cuenta.email]
        assert (db.scalar(select(func.count()).select_from(Empleado)) or 0) == 0

    def test_dataset_parcial_es_inconsistente(self, db):
        empleado = crear_empleado(db, nombre="Parcial")
        crear_cuenta(
            db, rol="EMPLEADO", email="empleado01@example.com",
            empleado=empleado,
        )
        assert seed_demo.evaluar_estado(db) == "inconsistente"
        with pytest.raises(seed_demo.DatasetDemoInconsistente):
            seed_demo.cargar(db, confirmado=True)
        # Nada se modificó: la cuenta parcial sigue igual.
        assert len(db.scalars(select(CuentaAcceso)).all()) == 1

    def test_datos_huerfanos_sin_cuentas_son_inconsistentes(self, db):
        db.add(Proyecto(
            nombre="Huerfano", nombre_normalizado="huerfano", estado="EN_PROCESO",
        ))
        db.commit()
        assert seed_demo.evaluar_estado(db) == "inconsistente"

class TestCargaDelDataset:
    def test_carga_completa_y_idempotente(self, db):
        mensaje = seed_demo.cargar(db, confirmado=True)
        assert "creado" in mensaje
        for tabla, esperado in seed_demo.CONTADOS_ESPERADOS.items():
            modelo = {
                "cuentas_acceso": CuentaAcceso, "empleados": Empleado,
                "proyectos": Proyecto, "participaciones": Participacion,
                "capacitaciones": Capacitacion, "evaluaciones": Evaluacion,
            }[tabla]
            total = db.scalar(select(func.count()).select_from(modelo)) or 0
            assert total == esperado, f"{tabla}: {total} != {esperado}"

        # Segunda ejecución: idempotente, sin duplicados.
        repetido = seed_demo.cargar(db, confirmado=True)
        assert "idempotente" in repetido
        correos = db.scalars(select(CuentaAcceso.email)).all()
        assert len(correos) == len(set(correos)) == seed_demo.CUENTAS_ESPERADAS

    def test_cuentas_con_hash_valido_y_estado_correcto(self, db):
        seed_demo.cargar(db, confirmado=True)
        cuentas = db.scalars(select(CuentaAcceso)).all()
        assert len(cuentas) == seed_demo.CUENTAS_ESPERADAS
        for cuenta in cuentas:
            assert cuenta.email.endswith("@" + seed_demo.DOMINIO_DEMO)
            assert cuenta.must_change_password is False
            assert cuenta.activo is True
            # Hash auténtico (bcrypt): la contraseña pública de demo funciona
            # y una incorrecta no.
            assert verificar_password(seed_demo.PASSWORD_DEMO, cuenta.password_hash)
            assert not verificar_password("OtraClave1", cuenta.password_hash)

        rh = next(c for c in cuentas if c.email == seed_demo.CORREO_RH_DEMO)
        assert rh.rol == "RH" and rh.empleado_id is None

        empleados = {c.email: c.empleado_id for c in cuentas if c.rol == "EMPLEADO"}
        assert len(empleados) == len(seed_demo.EMPLEADOS_DEMO)
        assert all(empleados.values())  # relación 1:1 presente y única
        assert len(set(empleados.values())) == len(empleados)

    def test_proyectos_participaciones_y_capacitaciones(self, db):
        seed_demo.cargar(db, confirmado=True)
        proyectos = db.scalars(select(Proyecto)).all()
        assert {p.estado for p in proyectos} == {"COMPLETADO", "CANCELADO", "EN_PROCESO"}
        for proyecto in proyectos:
            assert proyecto.nombre_normalizado == normalizar_nombre(proyecto.nombre)

        participaciones = db.scalars(select(Participacion)).all()
        pares = {(p.empleado_id, p.proyecto_id) for p in participaciones}
        assert len(pares) == len(participaciones)  # UNIQUE empleado/proyecto
        assert all(p.horas >= 0 for p in participaciones)
        fechas = {p.fecha_registro for p in participaciones}
        assert any(f < date(2026, 1, 1) for f in fechas)  # historia >90 días

        assert (db.scalar(select(func.count()).select_from(Capacitacion)) or 0) == len(
            seed_demo.CAPACITACIONES_DEMO
        )

    def test_evaluaciones_con_dos_periodos_y_reglas(self, db):
        seed_demo.cargar(db, confirmado=True)
        evaluaciones = db.scalars(select(Evaluacion)).all()
        assert len(evaluaciones) == seed_demo.CONTADOS_ESPERADOS["evaluaciones"]
        actual, anterior = periodo_actual(), seed_demo._periodo_anterior(periodo_actual())
        assert {e.periodo for e in evaluaciones} == {actual, anterior}
        # Solo empleados activos; única por empleado/periodo (UNIQUE §23).
        llaves = {(e.empleado_id, e.periodo) for e in evaluaciones}
        assert len(llaves) == len(evaluaciones)
        inactivo = db.scalar(
            select(Empleado).where(Empleado.activo.is_(False))
        )
        assert inactivo is not None
        assert all(e.empleado_id != inactivo.id for e in evaluaciones)

    def test_auditorias_con_operaciones_reales(self, db):
        seed_demo.cargar(db, confirmado=True)
        auditorias = db.scalars(select(AuditoriaModificacion)).all()
        operaciones = {a.operacion for a in auditorias}
        assert operaciones == {"CORRECCION", "MODIFICACION_EMPLEADO"}
        correcciones = [a for a in auditorias if a.operacion == "CORRECCION"]
        assert len(correcciones) == 2
        assert all(c.motivo for c in correcciones)

    def test_login_de_demo_funciona(self, client, db):
        seed_demo.cargar(db, confirmado=True)
        respuesta = client.post(
            URL_LOGIN,
            json={
                "email": seed_demo.CORREO_RH_DEMO,
                "password": seed_demo.PASSWORD_DEMO,
            },
        )
        assert respuesta.status_code == 200, respuesta.text
        cuerpo = respuesta.json()
        assert cuerpo["rol"] == "RH"
        assert cuerpo["must_change_password"] is False
        assert cuerpo["access_token"]

