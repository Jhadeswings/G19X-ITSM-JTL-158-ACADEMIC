"""Tests de AuditoriaModificacion para correcciones RH (Fase 4B)."""

import pytest
from sqlalchemy import select

from app.models.auditoria_modificacion import AuditoriaModificacion
from tests.helpers import (
    URL_ME_PARTICIPACIONES,
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


@pytest.fixture()
def participacion(client, token_empleado, db, cuenta_empleado):
    from app.core.fechas import fecha_negocio_hoy
    from app.core.normalizacion import normalizar_nombre
    from app.models.participacion import Participacion
    from app.models.proyecto import Proyecto

    proyecto = Proyecto(
        nombre="Proyecto Audit", nombre_normalizado=normalizar_nombre("Proyecto Audit")
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


def ultima_auditoria(db) -> AuditoriaModificacion:
    registros = db.scalars(select(AuditoriaModificacion)).all()
    assert registros, "Se esperaba al menos una auditoría"
    return registros[-1]


class TestAuditoriaDeCorreccion:
    def test_correccion_genera_auditoria(self, client, token_rh, participacion, db):
        respuesta = client.patch(
            f"{URL_RH_PARTICIPACIONES}/{participacion.id}",
            json={"horas": 150, "rol": "Senior"},
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 200
        registro = ultima_auditoria(db)
        assert registro.entidad == "participacion"
        assert registro.entidad_id == participacion.id
        assert registro.operacion == "CORRECCION"

    def test_actor_correcto(self, client, token_rh, cuenta_rh, participacion, db):
        client.patch(
            f"{URL_RH_PARTICIPACIONES}/{participacion.id}",
            json={"horas": 150},
            headers=cabecera(token_rh),
        )
        assert ultima_auditoria(db).actor_cuenta_id == cuenta_rh.id

    def test_guarda_valores_anteriores_y_nuevos(
        self, client, token_rh, participacion, db
    ):
        client.patch(
            f"{URL_RH_PARTICIPACIONES}/{participacion.id}",
            json={"horas": 150},
            headers=cabecera(token_rh),
        )
        registro = ultima_auditoria(db)
        assert registro.valores_anteriores == {"horas": 100}
        assert registro.valores_nuevos == {"horas": 150}

    def test_motivo_opcional(self, client, token_rh, participacion, db):
        client.patch(
            f"{URL_RH_PARTICIPACIONES}/{participacion.id}",
            json={"horas": 150, "motivo": "Corrección solicitada por el empleado"},
            headers=cabecera(token_rh),
        )
        assert ultima_auditoria(db).motivo == "Corrección solicitada por el empleado"

        client.patch(
            f"{URL_RH_PARTICIPACIONES}/{participacion.id}",
            json={"horas": 160},
            headers=cabecera(token_rh),
        )
        assert ultima_auditoria(db).motivo is None

    def test_fecha_registrada(self, client, token_rh, participacion, db):
        client.patch(
            f"{URL_RH_PARTICIPACIONES}/{participacion.id}",
            json={"horas": 150},
            headers=cabecera(token_rh),
        )
        assert ultima_auditoria(db).fecha is not None


class TestTransaccionalidad:
    def test_misma_transaccion_rollback_atomico(
        self, client, token_rh, cuenta_rh, participacion, db
    ):
        """Si el commit falla, no queda NI la corrección NI la auditoría."""
        from sqlalchemy.exc import DataError

        from app.schemas.participacion import ParticipacionRhUpdateIn
        from app.services import participacion_service

        datos = ParticipacionRhUpdateIn.model_validate({"horas": 999})
        # Motivo que excede String(512): fuerza un error en el MISMO commit.
        datos.motivo = "x" * 600

        with pytest.raises(DataError):
            participacion_service.corregir_participacion_rh(
                db,
                participacion=participacion,
                datos=datos,
                cuenta_rh=cuenta_rh,
            )
        db.rollback()

        # La participación quedó sin cambios y sin auditoría: mismo commit.
        db.refresh(participacion)
        assert participacion.horas == 100
        assert db.scalars(select(AuditoriaModificacion)).all() == []

    def test_creacion_no_audita_y_edicion_empleado_si(
        self, client, token_empleado, cuenta_empleado, participacion, db
    ):
        """La creación no audita; la edición del empleado audita (§9.1/§25).

        El fixture crea la participación vía el modelo (equivalente al alta):
        nunca genera auditoría. En cambio, la edición del empleado SÍ genera un
        registro ``MODIFICACION_EMPLEADO`` con el actor de su propia cuenta.
        """
        assert db.scalars(select(AuditoriaModificacion)).all() == []

        from app.schemas.participacion import ParticipacionEmpleadoUpdateIn
        from app.services import participacion_service

        participacion_service.actualizar_participacion_empleado(
            db,
            participacion,
            ParticipacionEmpleadoUpdateIn.model_validate({"horas": 88}),
            cuenta_empleado,
        )
        auditorias = db.scalars(select(AuditoriaModificacion)).all()
        assert len(auditorias) == 1
        assert auditorias[0].operacion == "MODIFICACION_EMPLEADO"
        assert auditorias[0].actor_cuenta_id == cuenta_empleado.id

    def test_consultas_no_auditan(self, client, token_empleado, participacion, db):
        """Las lecturas y los resultados dinámicos no generan auditoría (§25)."""
        client.get(
            f"{URL_ME_PARTICIPACIONES}/{participacion.id}",
            headers=cabecera(token_empleado),
        )
        assert db.scalars(select(AuditoriaModificacion)).all() == []
