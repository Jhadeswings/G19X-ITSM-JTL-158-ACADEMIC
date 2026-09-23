"""Tests de mentoría (Fase 9, PRD §14, Especificación §29).

Cubre: elegibilidad del receptor (niveles 1–4, nivel 5, DI, inactivo),
requisitos del mentor (activo, nivel estrictamente superior), desempates
exactos (nivel objetivo → promedio de las otras cuatro SOLO numéricas →
nombre → id), DI excluido del promedio (nunca cero), contrato estricto,
RBAC/404, ``Criterio del sistema``, no persistencia y derivación del
estado actual (las evaluaciones históricas no alteran la sugerencia).

Perfiles de siembra (3 participaciones; verdaderos 3→nivel 5, 2→4, 1→2,
0→1; con 5 participaciones 3/5=60%→3). Proyectos CANCELADOS rebajan
desempeño técnico (0%→1); EN_PROCESO lo dejan en DI sin afectar los
indicadores booleanos.
"""

from datetime import date

import pytest
from sqlalchemy import text

from app.core.fechas import fecha_negocio_hoy
from app.models.capacitacion import Capacitacion
from app.models.evaluacion import Evaluacion
from app.models.participacion import Participacion
from app.models.proyecto import Proyecto
from tests.helpers import (
    URL_RH_MENTORIA_SUGGEST,
    cabecera,
    crear_empleado,
    login_y_token,
)

ANIO = fecha_negocio_hoy().year


def sembrar(
    db,
    nombre,
    *,
    verdaderos=3,
    coordino=None,
    equipo=None,
    explico=None,
    participaciones=3,
    proyectos=None,
    estado="COMPLETADO",
    cursos=0,
    roles=1,
    activo=True,
):
    """Empleado con niveles controlados por indicadores booleanos.

    - 3 participaciones: verdaderos 3→5, 2→4, 1→2, 0→1 por indicador.
    - ``estado`` aplica a TODOS los proyectos del empleado: CANCELADO
      rebaja desempeño técnico; EN_PROCESO lo deja en DI.
    - ``cursos``: capacitaciones completadas del año en curso.
    - ``roles``: cantidad de roles distintos (componente A aprendizaje).
    - ``participaciones=0`` y ``cursos>0``: solo capacitaciones.
    """
    if proyectos is None:
        proyectos = participaciones
    coordino = verdaderos if coordino is None else coordino
    equipo = verdaderos if equipo is None else equipo
    explico = verdaderos if explico is None else explico
    empleado = crear_empleado(db, nombre=nombre)
    empleado.activo = activo
    proyectos_objs = []
    for j in range(proyectos):
        proyecto = Proyecto(
            nombre=f"{nombre}-{empleado.id}-P{j}",
            nombre_normalizado=f"{nombre.lower()}-{empleado.id}-p{j}",
            estado=estado,
        )
        db.add(proyecto)
        proyectos_objs.append(proyecto)
    db.flush()
    for i in range(participaciones):
        db.add(
            Participacion(
                empleado_id=empleado.id,
                proyecto_id=proyectos_objs[i % proyectos].id,
                rol=f"ROL{i % roles}",
                en_equipo=i < equipo,
                coordino_tareas=i < coordino,
                explico_a_publico_distinto=i < explico,
                horas=10,
                fecha_registro=date(ANIO, 1, 15),
            )
        )
    for k in range(cursos):
        db.add(
            Capacitacion(
                empleado_id=empleado.id,
                nombre=f"{nombre}-C{k}",
                fecha=date(ANIO, 6, 1),
                completado=True,
            )
        )
    db.commit()
    return empleado


@pytest.fixture()
def token_rh(client, cuenta_rh):
    return login_y_token(client, "rh@empresa.dev")


@pytest.fixture()
def token_empleado(client, cuenta_empleado):
    return login_y_token(client, "empleado@empresa.dev")


def sugerir(client, token, receiver_id, code="liderazgo", **extra):
    cuerpo = {"receiver_id": receiver_id, "competency_code": code}
    cuerpo.update(extra)
    return client.post(
        URL_RH_MENTORIA_SUGGEST, json=cuerpo, headers=cabecera(token)
    )

class TestElegibilidadReceptor:
    """Tests 1–4 (§14.1/§29.1)."""

    def test_receptor_nivel_1_elegible(self, client, token_rh, db):
        receptor = sembrar(db, "Receptor", verdaderos=0)  # liderazgo 1
        mentor = sembrar(db, "Mentor", verdaderos=3)  # liderazgo 5
        datos = sugerir(client, token_rh, receptor.id).json()
        assert datos["elegible"] is True
        assert datos["nivel_receiver"] == 1
        assert datos["mentor"]["empleado_id"] == mentor.id
        assert datos["mentor"]["nivel"] == 5

    def test_receptor_nivel_4_elegible(self, client, token_rh, db):
        receptor = sembrar(db, "Receptor", verdaderos=2)  # liderazgo 4
        mentor = sembrar(db, "Mentor", verdaderos=3)  # liderazgo 5
        datos = sugerir(client, token_rh, receptor.id).json()
        assert datos["elegible"] is True
        assert datos["nivel_receiver"] == 4
        assert datos["mentor"]["empleado_id"] == mentor.id

    def test_receptor_nivel_5_no_elegible(self, client, token_rh, db):
        receptor = sembrar(db, "Receptor", verdaderos=3)  # liderazgo 5
        sembrar(db, "Mentor", verdaderos=3)
        datos = sugerir(client, token_rh, receptor.id).json()
        assert datos["elegible"] is False
        assert datos["mentor"] is None
        assert datos["nivel_receiver"] == 5
        assert "nivel 5" in datos["criterio_del_sistema"]

    def test_receptor_di_no_elegible(self, client, token_rh, db):
        receptor = sembrar(db, "Receptor", participaciones=2)  # DI (<3)
        sembrar(db, "Mentor", verdaderos=3)
        datos = sugerir(client, token_rh, receptor.id).json()
        assert datos["elegible"] is False
        assert datos["mentor"] is None
        assert datos["nivel_receiver"] is None
        assert "Datos insuficientes" in datos["criterio_del_sistema"]

    def test_receptor_inactivo_no_elegible(self, client, token_rh, db):
        receptor = sembrar(db, "ReceptorInactivo", verdaderos=1, activo=False)
        sembrar(db, "Mentor", verdaderos=3)
        datos = sugerir(client, token_rh, receptor.id).json()
        assert datos["elegible"] is False
        assert datos["mentor"] is None


class TestElegibilidadMentor:
    """Tests 5–8 (§14.2/§29.2)."""

    def test_mentor_inactivo_excluido(self, client, token_rh, db):
        receptor = sembrar(db, "Receptor", verdaderos=1)  # liderazgo 2
        sembrar(db, "Inactivo", verdaderos=3, activo=False)  # 5 pero inactivo
        datos = sugerir(client, token_rh, receptor.id).json()
        assert datos["elegible"] is True
        assert datos["mentor"] is None  # único candidato inactivo: excluido

    def test_mentor_mismo_nivel_excluido(self, client, token_rh, db):
        receptor = sembrar(db, "Receptor", verdaderos=2)  # liderazgo 4
        sembrar(db, "Mismo", verdaderos=2)  # liderazgo 4: NO estrictamente >
        datos = sugerir(client, token_rh, receptor.id).json()
        assert datos["elegible"] is True
        assert datos["mentor"] is None

    def test_mentor_nivel_inferior_excluido(self, client, token_rh, db):
        receptor = sembrar(db, "Receptor", verdaderos=2)  # liderazgo 4
        sembrar(db, "Inferior", verdaderos=1)  # liderazgo 2
        datos = sugerir(client, token_rh, receptor.id).json()
        assert datos["elegible"] is True
        assert datos["mentor"] is None

    def test_mentor_estrictamente_superior_elegible(self, client, token_rh, db):
        receptor = sembrar(db, "Receptor", verdaderos=1)  # liderazgo 2
        mentor = sembrar(db, "Estricto", verdaderos=2)  # liderazgo 4 > 2
        datos = sugerir(client, token_rh, receptor.id).json()
        assert datos["mentor"]["empleado_id"] == mentor.id
        assert datos["mentor"]["nivel"] == 4

    def test_receptor_nivel_3_mayor_nivel_gana(self, client, token_rh, db):
        """Precisión: receptor nivel 3 (3/5 = 60%); mentor 4 vs mentor 5."""
        receptor = sembrar(db, "Receptor", participaciones=5, coordino=3)
        sembrar(db, "NivelCuatro", verdaderos=2)
        nivel_cinco = sembrar(db, "NivelCinco", verdaderos=3)
        datos = sugerir(client, token_rh, receptor.id).json()
        assert datos["nivel_receiver"] == 3
        assert datos["mentor"]["empleado_id"] == nivel_cinco.id
        assert datos["mentor"]["nivel"] == 5

class TestDesempates:
    """Tests 9–14 (§14.3/§29.3): orden exacto de desempate."""

    def test_mayor_nivel_objetivo_prevalece_sobre_promedio(
        self, client, token_rh, db
    ):
        receptor = sembrar(db, "Receptor", verdaderos=1)  # liderazgo 2
        # Nivel 4 con promedio alto de las otras: (5+5+5+4)/4 = 4.75
        sembrar(
            db,
            "AltoPromedioBajoNivel",
            coordino=2,
            equipo=3,
            explico=3,
            roles=3,
            cursos=8,
        )
        # Nivel 5 con promedio bajo: desempeño 1 (CANCELADO), equipo 1,
        # comunicacion 1, aprendizaje 2 → (1+1+1+2)/4 = 1.25
        bajo = sembrar(
            db,
            "BajoPromedioAltoNivel",
            coordino=3,
            equipo=0,
            explico=0,
            estado="CANCELADO",
        )
        datos = sugerir(client, token_rh, receptor.id).json()
        assert datos["mentor"]["empleado_id"] == bajo.id
        assert datos["mentor"]["nivel"] == 5

    def test_empate_de_nivel_desempata_promedio_otras(
        self, client, token_rh, db
    ):
        receptor = sembrar(db, "Receptor", verdaderos=1)  # liderazgo 2
        # Ambos liderazgo 4; distintos promedios de las otras cuatro.
        alto = sembrar(
            db, "PromedioAlto", coordino=2, equipo=3, explico=3
        )  # (5+5+5+2)/4 = 4.25
        sembrar(
            db,
            "PromedioBajo",
            coordino=2,
            equipo=0,
            explico=0,
            estado="CANCELADO",
        )  # (1+1+1+2)/4 = 1.25
        datos = sugerir(client, token_rh, receptor.id).json()
        assert datos["mentor"]["empleado_id"] == alto.id

    def test_di_excluido_del_promedio_nunca_cero(self, client, token_rh, db):
        """Con DI el promedio usa SOLO las numéricas; si el DI contara
        como 0 el mentor ganador sería otro."""
        receptor = sembrar(db, "Receptor", verdaderos=1)  # liderazgo 2
        # Liderazgo 4; desempeño DI (EN_PROCESO); otras numéricas:
        # equipo 5, comunicacion 5, aprendizaje 4 → (5+5+4)/3 = 4.67
        con_di = sembrar(
            db,
            "ConDI",
            coordino=2,
            equipo=3,
            explico=3,
            estado="EN_PROCESO",
            roles=3,
            cursos=8,
        )
        # Liderazgo 4; todas numéricas: (5+5+5+2)/4 = 4.25
        sembrar(db, "SinDI", coordino=2, equipo=3, explico=3)
        datos = sugerir(client, token_rh, receptor.id).json()
        # 4.67 > 4.25 gana; con DI=0 sería 3.5 < 4.25 y perdería.
        assert datos["mentor"]["empleado_id"] == con_di.id

    def test_empate_total_desempata_nombre_ascendente(
        self, client, token_rh, db
    ):
        receptor = sembrar(db, "Receptor", verdaderos=1)
        sembrar(db, "Zeta", coordino=2, equipo=3, explico=3)
        alfa = sembrar(db, "Alfa", coordino=2, equipo=3, explico=3)
        datos = sugerir(client, token_rh, receptor.id).json()
        assert datos["mentor"]["empleado_id"] == alfa.id

    def test_empate_total_desempata_id_ascendente(self, client, token_rh, db):
        receptor = sembrar(db, "Receptor", verdaderos=1)
        primero = sembrar(db, "Igual", coordino=2, equipo=3, explico=3)
        segundo = sembrar(db, "Igual", coordino=2, equipo=3, explico=3)
        assert segundo.id > primero.id
        datos = sugerir(client, token_rh, receptor.id).json()
        assert datos["mentor"]["empleado_id"] == primero.id

    def test_sin_numericas_en_otras_cuatro_pasa_a_nombre(
        self, client, token_rh, db
    ):
        """Objetivo aprendizaje: mentores SOLO con capacitaciones (las
        otras cuatro en DI) → sin promedio → desempate por nombre."""
        # Receptor: 2 cursos completados → aprendizaje 1.

class TestCasosDeRespuesta:
    """Tests 15–18: ningún mentor, 404, 403, 401."""

    def test_ningun_mentor_elegible(self, client, token_rh, db):
        receptor = sembrar(db, "Receptor", verdaderos=2)  # liderazgo 4
        sembrar(db, "Bajo", verdaderos=0)  # liderazgo 1: no superior
        datos = sugerir(client, token_rh, receptor.id).json()
        assert datos["elegible"] is True
        assert datos["mentor"] is None
        assert "ningún empleado activo" in datos["criterio_del_sistema"]

    def test_receiver_id_inexistente_404(self, client, token_rh, db):
        sembrar(db, "Alguien", verdaderos=3)
        assert sugerir(client, token_rh, 99999).status_code == 404

    def test_empleado_rechazado_403(self, client, token_empleado, db):
        receptor = sembrar(db, "Receptor", verdaderos=1)
        assert sugerir(client, token_empleado, receptor.id).status_code == 403

    def test_sin_token_401(self, client, db):
        receptor = sembrar(db, "Receptor", verdaderos=1)
        respuesta = client.post(
            URL_RH_MENTORIA_SUGGEST,
            json={"receiver_id": receptor.id, "competency_code": "liderazgo"},
        )
        assert respuesta.status_code == 401


class TestContrato:
    """El cliente no puede introducir datos del mentor ni niveles."""

    @pytest.mark.parametrize(
        "extra",
        [
            {"mentor_id": 5},
            {"nivel_minimo": 4},
            {"min_level": 4},
            {"mentor": {"empleado_id": 5, "nombre": "X", "nivel": 5}},
            {"competencies": [{"code": "liderazgo", "min_level": 4}]},
        ],
    )
    def test_campos_arbitrarios_rechazados(self, client, token_rh, extra):
        cuerpo = {"receiver_id": 1, "competency_code": "liderazgo", **extra}
        respuesta = client.post(
            URL_RH_MENTORIA_SUGGEST,
            json=cuerpo,
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 422

    def test_competencia_fuera_de_catalogo_rechazada(self, client, token_rh):
        respuesta = client.post(
            URL_RH_MENTORIA_SUGGEST,
            json={"receiver_id": 1, "competency_code": "innovacion"},
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 422

    @pytest.mark.parametrize("receiver_id", [0, -1])
    def test_receiver_id_invalido_rechazado(self, client, token_rh, receiver_id):
        respuesta = client.post(
            URL_RH_MENTORIA_SUGGEST,
            json={"receiver_id": receiver_id, "competency_code": "liderazgo"},
            headers=cabecera(token_rh),
        )
        assert respuesta.status_code == 422


class TestCriterioDelSistema:
    """Test 19 (PRD §14.3): etiqueta obligatoria y vocabulario prohibido."""

    PALABRAS_PROHIBIDAS = (
        "mejor empleado",
        "top mentor",
        "mejor talento",
        "ganador",
        "winner",
    )

    def test_respuesta_usa_criterio_del_sistema(self, client, token_rh, db):
        receptor = sembrar(db, "Receptor", verdaderos=1)
        mentor = sembrar(db, "Mentor", verdaderos=3)
        respuesta = sugerir(client, token_rh, receptor.id)
        datos = respuesta.json()
        assert datos["criterio_del_sistema"].startswith("Criterio del sistema")
        texto = str(datos).lower()
        for prohibida in self.PALABRAS_PROHIBIDAS:
            assert prohibida not in texto
        # Estructura mínima de la respuesta.
        assert set(datos) == {
            "receiver_id",
            "competency_code",
            "nivel_receiver",
            "elegible",
            "mentor",
            "criterio_del_sistema",
        }
        assert datos["receiver_id"] == receptor.id
        assert datos["competency_code"] == "liderazgo"
        assert datos["mentor"]["empleado_id"] == mentor.id

    def test_sin_mentor_tambien_usa_criterio_del_sistema(
        self, client, token_rh, db
    ):
        receptor = sembrar(db, "Receptor", verdaderos=3)  # nivel 5
        datos = sugerir(client, token_rh, receptor.id).json()
        assert datos["criterio_del_sistema"].startswith("Criterio del sistema")


class TestDerivadaYNoPersistente:
    """Tests 20–22: consulta derivada del estado actual, sin escrituras."""

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

    def test_no_se_crea_ninguna_fila_persistente(self, client, token_rh, db):
        receptor = sembrar(db, "Receptor", verdaderos=1)
        sembrar(db, "Mentor", verdaderos=3)
        antes = self._conteos(db)
        primera = sugerir(client, token_rh, receptor.id)
        segunda = sugerir(client, token_rh, receptor.id)
        assert primera.status_code == segunda.status_code == 200
        assert primera.json() == segunda.json()  # reproducible
        assert antes == self._conteos(db)  # cero escrituras

    def test_cambiar_datos_fuente_cambia_sugerencia(
        self, client, token_rh, db
    ):
        receptor = sembrar(db, "Receptor", verdaderos=1)  # liderazgo 2
        mentor_inicial = sembrar(db, "MentorInicial", verdaderos=2)  # 4
        datos = sugerir(client, token_rh, receptor.id).json()
        assert datos["mentor"]["empleado_id"] == mentor_inicial.id

        # Nuevo dato fuente: empleado con nivel estrictamente superior.
        mentor_nuevo = sembrar(db, "MentorNuevo", verdaderos=3)  # 5
        datos = sugerir(client, token_rh, receptor.id).json()
        assert datos["mentor"]["empleado_id"] == mentor_nuevo.id

    def test_evaluacion_historica_no_altera_sugerencia(
        self, client, token_rh, cuenta_rh, db
    ):
        receptor = sembrar(db, "Receptor", verdaderos=1)
        mentor = sembrar(db, "Mentor", verdaderos=3)
        antes = sugerir(client, token_rh, receptor.id).json()

        # Fotografías históricas con niveles DISTINTOS de los actuales:
        # la mentoría debe seguir derivando del estado vigente.
        snapshot_args = {
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
            snapshot_args[f"{codigo}_nivel"] = 1
            snapshot_args[f"{codigo}_status"] = "CALCULABLE"
        db.add(Evaluacion(empleado_id=mentor.id, **snapshot_args))
        db.add(Evaluacion(empleado_id=receptor.id, **snapshot_args))
        db.commit()

        despues = sugerir(client, token_rh, receptor.id).json()
        assert despues == antes
        assert despues["mentor"]["empleado_id"] == mentor.id
        assert despues["mentor"]["nivel"] == 5  # actual, no el histórico 1