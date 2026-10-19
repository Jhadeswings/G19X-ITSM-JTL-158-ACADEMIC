"""Seed OPCIONAL de datos sintéticos de demostración (entrega académica).

- No sustituye a Alembic (única fuente oficial del esquema, ET §1/§33).
- No corre en el arranque normal de Docker: requiere invocación explícita
  y confirmación. El seed RH oficial (``app.core.seed``) queda intacto.
- Barreras (todas ANTES de escribir): rechaza APP_ENV=production; exige
  ``--confirmar-demo``; la base debe llamarse ``talento_demo*`` (verificado
  en la URL Y con ``current_database()`` en la conexión real, fail-closed);
  solo carga en una base VACÍA o con EXACTAMENTE este dataset (idempotente);
  ante datos ajenos o un dataset parcial/inconsistente aborta sin modificar.
  Nunca borra: sin TRUNCATE ni DROP en este módulo.

Dataset 100 % sintético: dominio reservado ``example.com`` y
contraseña pública de demostración — SOLO evaluación local, jamás producción.
Uso y advertencias: README, sección «Datos de demostración»::

    DATABASE_URL=postgresql+psycopg2://usuario:clave@host:puerto/talento_demo \
        python -m app.core.seed_demo --confirmar-demo
"""

from __future__ import annotations

import argparse
import os
from datetime import date
from urllib.parse import urlsplit

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.core.fechas import periodo_actual
from app.core.normalizacion import normalizar_nombre
from app.core.security import hash_password
from app.models.capacitacion import Capacitacion
from app.models.cuenta_acceso import CuentaAcceso
from app.models.empleado import Empleado
from app.models.evaluacion import COMPETENCIAS, Evaluacion
from app.models.participacion import Participacion
from app.models.proyecto import Proyecto
from app.schemas.participacion import (
    ParticipacionEmpleadoUpdateIn,
    ParticipacionRhUpdateIn,
)
from app.schemas.resultado_actual import EstadoCompetencia
from app.services import evaluation_service, nine_box, participacion_service
from app.services.competency_engine import CompetencyEngine

# ---------------------------------------------------------------------------
# Convenciones y dataset sintético (personas, proyectos y cursos ficticios)
# ---------------------------------------------------------------------------

DOMINIO_DEMO = "example.com"
PREFIJO_BASE_DEMO = "talento_demo"
CORREO_RH_DEMO = f"rh.demo@{DOMINIO_DEMO}"
PASSWORD_DEMO = "Demo2026A"  # Pública, exclusiva de la demo local.

# Empleados ficticios: (correo, nombre, puesto, área, ingreso, activo)
EMPLEADOS_DEMO = (
    ("empleado01@example.com", "Alexa Ríos Fuentes", "Desarrolladora Backend", "Tecnología", date(2021, 3, 15), True),
    ("empleado02@example.com", "Bruno Salazar Mina", "Diseñador UX", "Tecnología", date(2022, 7, 4), True),
    ("empleado03@example.com", "Camila Vega Ortega", "Consultora de Negocio", "Consultoría", date(2019, 11, 20), True),
    ("empleado04@example.com", "Diego Lara Pineda", "Ingeniero de Datos", "Tecnología", date(2023, 2, 13), True),
    ("empleado05@example.com", "Elena Marín Soto", "Líder de Proyecto", "Consultoría", date(2020, 5, 4), True),
    ("empleado06@example.com", "Fabio Ruiz Cantú", "Analista de Soporte", "Operaciones", date(2024, 9, 2), False),
)

# Proyectos ficticios: (nombre, área, cliente, estado)
PROYECTOS_DEMO = (
    ("Portal Interno PluriOne", "Tecnología", None, "COMPLETADO"),
    ("App Clientes Costa Verde", "Consultoría", "Grupo Costa Verde (ficticio)", "COMPLETADO"),
    ("Migración de Datos Maestros", "Tecnología", None, "CANCELADO"),
    ("Rediseño del Portal Web", "Tecnología", None, "EN_PROCESO"),
)

# Participaciones: (correo, proyecto, rol, entregables, equipo, coordinó,
#                   explicó, resolvió, horas, fecha de registro)
PARTICIPACIONES_DEMO = (
    ("empleado01@example.com", "Portal Interno PluriOne", "Backend", "API de reportes y autenticación", True, True, True, False, 160, date(2026, 1, 12)),
    ("empleado01@example.com", "App Clientes Costa Verde", "Backend", "Servicios de sincronización", False, True, True, True, 120, date(2026, 3, 3)),
    ("empleado01@example.com", "Migración de Datos Maestros", "Ingeniería de datos", "Carga histórica validada", True, False, False, True, 80, date(2026, 5, 18)),
    ("empleado01@example.com", "Rediseño del Portal Web", "Backend", "Migración de endpoints (en curso)", True, True, False, False, 60, date(2026, 8, 10)),
    ("empleado02@example.com", "Portal Interno PluriOne", "Diseño UI", "Sistema de componentes", False, True, False, False, 100, date(2026, 2, 2)),
    ("empleado02@example.com", "App Clientes Costa Verde", "Diseño UX", "Flujos de alta de clientes", False, False, True, False, 90, date(2026, 4, 14)),
    ("empleado02@example.com", "Migración de Datos Maestros", "Diseño de dashboards", "Tablero de seguimiento", False, True, True, True, 70, date(2026, 6, 1)),
    ("empleado03@example.com", "Portal Interno PluriOne", "Análisis de negocio", "Requerimientos del portal", True, True, True, False, 110, date(2026, 1, 26)),
    ("empleado03@example.com", "App Clientes Costa Verde", "Coordinación", "Gestión con el cliente", True, False, False, True, 140, date(2026, 3, 17)),
    ("empleado03@example.com", "Migración de Datos Maestros", "Análisis", "Inventario de fuentes", False, True, True, False, 60, date(2026, 5, 26)),
    ("empleado03@example.com", "Rediseño del Portal Web", "Coordinación", "Plan de liberación", False, True, True, False, 50, date(2026, 9, 1)),
    ("empleado04@example.com", "App Clientes Costa Verde", "Ingeniería de datos", "Pipelines de ingesta", False, True, False, True, 130, date(2026, 4, 7)),
    ("empleado04@example.com", "Rediseño del Portal Web", "Datos", "Modelo intermedio", False, False, True, False, 80, date(2026, 8, 24)),
    ("empleado05@example.com", "Portal Interno PluriOne", "Liderazgo técnico", "Arquitectura y revisiones", False, True, True, False, 150, date(2026, 1, 19)),
    ("empleado05@example.com", "App Clientes Costa Verde", "Liderazgo técnico", "Gestión del proveedor", False, False, True, True, 70, date(2026, 9, 1)),
    ("empleado05@example.com", "Migración de Datos Maestros", "Liderazgo técnico", "Plan de migración", True, True, False, False, 90, date(2026, 5, 11)),
    ("empleado06@example.com", "Rediseño del Portal Web", "Soporte", "Mesa de ayuda inicial", False, True, False, True, 40, date(2025, 6, 16)),
)

# Capacitaciones ficticias: (correo, nombre, fecha, completado)
CAPACITACIONES_DEMO = (
    ("empleado01@example.com", "Python avanzado", date(2026, 2, 10), True),
    ("empleado01@example.com", "Seguridad OWASP", date(2026, 5, 6), True),
    ("empleado01@example.com", "Kubernetes básico", date(2026, 9, 15), True),
    ("empleado01@example.com", "Taller de presentaciones", date(2026, 10, 5), False),
    ("empleado02@example.com", "Accesibilidad web", date(2026, 3, 11), True),
    ("empleado02@example.com", "Design systems", date(2026, 7, 22), True),
    ("empleado03@example.com", "Negociación", date(2026, 4, 9), True),
    ("empleado03@example.com", "Facilitación de talleres", date(2026, 8, 19), True),
    ("empleado03@example.com", "Excel avanzado", date(2025, 10, 1), True),
    ("empleado04@example.com", "dbt fundamentals", date(2026, 6, 3), True),
    ("empleado04@example.com", "Orquestación con Airflow", date(2026, 6, 25), True),
    ("empleado05@example.com", "Liderazgo de equipos", date(2026, 2, 27), True),
    ("empleado05@example.com", "Scrum", date(2026, 5, 14), True),
    ("empleado05@example.com", "Gestión de riesgos", date(2026, 7, 30), True),
    ("empleado05@example.com", "Coaching", date(2026, 9, 24), True),
    ("empleado06@example.com", "Herramientas de soporte", date(2024, 11, 12), True),
)

# Recuentos esperados del dataset completo (idempotencia/consistencia).
# Evaluaciones = 2 periodos x empleados activos (el 06 está inactivo y el
# servicio oficial solo evalúa activos).
CUENTAS_ESPERADAS = 1 + len(EMPLEADOS_DEMO)
CONTADOS_ESPERADOS = {
    "cuentas_acceso": CUENTAS_ESPERADAS,
    "empleados": len(EMPLEADOS_DEMO),
    "proyectos": len(PROYECTOS_DEMO),
    "participaciones": len(PARTICIPACIONES_DEMO),
    "capacitaciones": len(CAPACITACIONES_DEMO),
    "evaluaciones": 2 * sum(1 for fila in EMPLEADOS_DEMO if fila[5]),
}


# ---------------------------------------------------------------------------
# Errores y barreras (todas se evalúan ANTES de escribir cualquier dato)
# ---------------------------------------------------------------------------


class ErrorSeedDemo(RuntimeError):
    """Fallo controlado del seed de demostración (nunca modifica datos)."""


class EntornoDeProduccion(ErrorSeedDemo):
    """El entorno está identificado como producción (APP_ENV=production)."""


class ConfirmacionFaltante(ErrorSeedDemo):
    """Falta la confirmación explícita (--confirmar-demo)."""


class BaseNoDestinadaADemo(ErrorSeedDemo):
    """La base de datos no cumple la convención 'talento_demo*'."""


class BaseConDatosAjenos(ErrorSeedDemo):
    """La base contiene información ajena al dataset de demostración."""


class DatasetDemoInconsistente(ErrorSeedDemo):
    """El dataset está parcialmente creado o no coincide con lo esperado."""


def es_entorno_de_produccion() -> bool:
    """¿El entorno se identifica explícitamente como producción?

    El MVP local no define un modo «producción»; este seed adopta la
    convención ``APP_ENV=production`` (documentada en el README): cualquier
    despliegue real debe fijarla y entonces este mecanismo se niega a correr
    aunque el resto de barraras fallara de forma inesperada.
    """
    return os.environ.get("APP_ENV", "").strip().lower() == "production"


def nombre_de_la_base(url: str) -> str:
    """Extrae el nombre de la base de una URL (fail-closed)."""
    if not url or not url.strip():
        raise BaseNoDestinadaADemo(
            "DATABASE_URL vacía: no se puede demostrar que la base sea de "
            "demostración. Abortando sin escribir nada."
        )
    nombre = (urlsplit(url.strip()).path or "").lstrip("/")
    if not nombre:
        raise BaseNoDestinadaADemo(
            "DATABASE_URL sin nombre de base: abortando (fail-closed)."
        )
    return nombre


def es_base_de_demostracion(nombre: str) -> bool:
    """¿El nombre cumple la convención exclusiva de demostración?"""
    if not nombre.startswith(PREFIJO_BASE_DEMO):
        return False
    sufijo = nombre[len(PREFIJO_BASE_DEMO):]
    return sufijo == "" or sufijo.startswith("_")


def verificar_base_de_demostracion(nombre: str) -> None:
    """Barrera de convención de nombre (rechaza siempre la de desarrollo)."""
    if nombre == "talento_alto_potencial":
        raise BaseNoDestinadaADemo(
            "REFUZADO: la base de DESARROLLO 'talento_alto_potencial' jamás "
            "puede recibir datos de demostración."
        )
    if not es_base_de_demostracion(nombre):
        raise BaseNoDestinadaADemo(
            f"REFUZADO: '{nombre}' no es una base de demostración. Debe "
            f"empezar por '{PREFIJO_BASE_DEMO}' (p. ej. talento_demo)."
        )

# ---------------------------------------------------------------------------
# Estado de la base (solo lecturas; decide si se puede cargar)
# ---------------------------------------------------------------------------


def _contar(db: Session) -> dict[str, int]:
    return {
        "cuentas_acceso": db.scalar(select(func.count()).select_from(CuentaAcceso)) or 0,
        "empleados": db.scalar(select(func.count()).select_from(Empleado)) or 0,
        "proyectos": db.scalar(select(func.count()).select_from(Proyecto)) or 0,
        "participaciones": db.scalar(select(func.count()).select_from(Participacion)) or 0,
        "capacitaciones": db.scalar(select(func.count()).select_from(Capacitacion)) or 0,
        "evaluaciones": db.scalar(select(func.count()).select_from(Evaluacion)) or 0,
    }


def _correos_actuales(db: Session) -> set[str]:
    return set(db.scalars(select(CuentaAcceso.email)).all())


def _correos_esperados() -> set[str]:
    return {CORREO_RH_DEMO} | {fila[0] for fila in EMPLEADOS_DEMO}


def evaluar_estado(db: Session) -> str:
    """Clasifica la base: 'vacia' | 'demo' | 'ajena' | 'inconsistente'.

    Reglas (sin escribir nada):
    - cuentas vacías + resto vacío → 'vacia';
    - cuentas vacías + otras tablas con datos → 'inconsistente' (huérfanos);
    - algún correo fuera del dominio de demo → 'ajena';
    - correos solo del dominio demo pero conjunto/recuentos distintos de lo
      esperado → 'inconsistente' (parcial o mutado);
    - correos y recuentos exactos → 'demo' (idempotente).
    """
    contados = _contar(db)
    if contados["cuentas_acceso"] == 0:
        if any(v for k, v in contados.items() if k != "cuentas_acceso"):
            return "inconsistente"
        return "vacia"

    correos = _correos_actuales(db)
    esperados = _correos_esperados()
    if not correos <= esperados:
        return "ajena"
    if correos != esperados or any(
        contados[tabla] != esperado
        for tabla, esperado in CONTADOS_ESPERADOS.items()
    ):
        return "inconsistente"
    return "demo"


# ---------------------------------------------------------------------------
# Construcción del dataset (modelos y servicios reales; sin atajos)
# ---------------------------------------------------------------------------


def cargar_dataset(db: Session) -> dict[str, int]:
    """Construye el dataset completo. REQUIERE una base vacía (evaluar_estado)."""
    hash_demo = hash_password(PASSWORD_DEMO)

    # 1) Empleados ficticios + sus cuentas 1:1 (sin must_change_password:
    #    el evaluador entra directo; política PRD §3.5 ya validada por hash).
    empleados: dict[str, Empleado] = {}
    cuentas: dict[str, CuentaAcceso] = {}
    for correo, nombre, puesto, area, ingreso, activo in EMPLEADOS_DEMO:
        empleado = Empleado(
            nombre=nombre, puesto=puesto, area=area,
            fecha_ingreso=ingreso, activo=activo,
        )
        db.add(empleado)
        db.flush()
        cuenta = CuentaAcceso(
            rol="EMPLEADO", email=correo, password_hash=hash_demo,
            activo=True, must_change_password=False, empleado_id=empleado.id,
        )
        db.add(cuenta)
        empleados[correo] = empleado
        cuentas[correo] = cuenta

    cuenta_rh = CuentaAcceso(
        rol="RH", email=CORREO_RH_DEMO, password_hash=hash_demo,
        activo=True, must_change_password=False,
    )
    db.add(cuenta_rh)
    db.flush()

    # 2) Proyectos con la normalización canónica (§7) para el UNIQUE.
    proyectos: dict[str, Proyecto] = {}
    for nombre, area, cliente, estado in PROYECTOS_DEMO:
        proyecto = Proyecto(
            nombre=nombre, nombre_normalizado=normalizar_nombre(nombre),
            area=area, cliente=cliente, estado=estado,
        )
        db.add(proyecto)
        proyectos[nombre] = proyecto
    db.flush()

    # 3) Participaciones (modelo directo para fijar fecha_registro histórica
    #    del dataset; la app la fija con la fecha del día en el flujo real).
    participaciones: dict[tuple[str, str], Participacion] = {}
    for correo, nombre_proy, rol, entregables, equipo, coordino, explico, resolvio, horas, fecha in PARTICIPACIONES_DEMO:
        participacion = Participacion(
            empleado_id=empleados[correo].id, proyecto_id=proyectos[nombre_proy].id,
            rol=rol, entregables=entregables, en_equipo=equipo,
            coordino_tareas=coordino, explico_a_publico_distinto=explico,
            resolvio_problema=resolvio, horas=horas, fecha_registro=fecha,
        )
        db.add(participacion)
        participaciones[(correo, nombre_proy)] = participacion
    db.flush()

    # 4) Auditorías REALES vía los servicios oficiales (transaccionales §25).
    _auditorias_de_ejemplo(db, cuenta_rh, cuentas, participaciones)

    # 5) Capacitaciones ficticias.
    for correo, nombre, fecha, completado in CAPACITACIONES_DEMO:
        db.add(Capacitacion(
            empleado_id=empleados[correo].id, nombre=nombre,
            fecha=fecha, completado=completado,
        ))
    db.commit()

    # 6) Evaluación oficial del periodo VIGENTE con el servicio real (§23).
    evaluation_service.generar_evaluaciones(db, cuenta_rh=cuenta_rh)

    # 7) Snapshot sintético del periodo anterior (ver docstring del helper).
    _snapshot_periodo_anterior(db, cuenta_rh=cuenta_rh)
    db.commit()
    return _contar(db)

def _auditorias_de_ejemplo(
    db: Session,
    cuenta_rh: CuentaAcceso,
    cuentas: dict[str, CuentaAcceso],
    participaciones: dict[tuple[str, str], Participacion],
) -> None:
    """Genera auditorías con los SERVICIOS oficiales (§25, transaccionales).

    Dos CORRECCIONES de RH (con motivo) y una MODIFICACION_EMPLEADO, todas
    con cambio real de valor (un no-cambio no audita).
    """
    part_e1 = participaciones[("empleado01@example.com", "App Clientes Costa Verde")]
    participacion_service.corregir_participacion_rh(
        db, participacion=part_e1, cuenta_rh=cuenta_rh,
        datos=ParticipacionRhUpdateIn(
            horas=160, motivo="Ajuste de horas del proveedor (demo)",
        ),
    )
    part_e3 = participaciones[("empleado03@example.com", "Migración de Datos Maestros")]
    participacion_service.corregir_participacion_rh(
        db, participacion=part_e3, cuenta_rh=cuenta_rh,
        datos=ParticipacionRhUpdateIn(
            entregables="Inventario de fuentes y diccionario de datos (v2)",
            motivo="Entregables incompletos en el registro original (demo)",
        ),
    )
    part_e2 = participaciones[("empleado02@example.com", "Portal Interno PluriOne")]
    participacion_service.actualizar_participacion_empleado(
        db, part_e2,
        ParticipacionEmpleadoUpdateIn(rol="Diseño UI/UX"),
        cuenta=cuentas["empleado02@example.com"],
    )


def _periodo_anterior(periodo: str) -> str:
    """'2026-Q1' → '2025-Q4'; '2026-Q4' → '2026-Q3' (formato YYYY-QN)."""
    anio, trimestre = periodo.split("-Q")
    trimestre = int(trimestre)
    if trimestre == 1:
        return f"{int(anio) - 1}-Q4"
    return f"{anio}-Q{trimestre - 1}"


def _snapshot_periodo_anterior(db: Session, *, cuenta_rh: CuentaAcceso) -> None:
    """Snapshot histórico sintético del trimestre anterior (demo de evolución).

    Limitación declarada: el servicio oficial genera SOLO el periodo vigente
    (§23), así que la «historia» previa no puede producirse con él. Para no
    falsificar el mecanismo, este snapshot se construye con los niveles
    REALES que el CompetencyEngine calcula hoy, restando un nivel a la
    primera competencia calculable >1 (una evolución plausible y determinista),
    y derivando los ejes y la celda con el nine_box PURO (§20). La inmutabilidad
    (trigger §24) no se toca: solo INSERT, nunca UPDATE/DELETE.
    """
    motor = CompetencyEngine(db)
    for correo, nombre, _puesto, _area, _ingreso, activo in EMPLEADOS_DEMO:
        if not activo:
            continue  # el servicio oficial solo evalúa activos (§23)
        empleado = db.scalar(
            select(Empleado).where(Empleado.nombre == nombre)
        )
        if empleado is None:
            continue
        competencias = motor.calculate(empleado.id).competencias
        ajustadas, reducido = [], False
        for competencia in competencias:
            if (
                not reducido
                and competencia.estado == EstadoCompetencia.CALCULABLE
                and (competencia.nivel or 1) > 1
            ):
                ajustadas.append(competencia.model_copy(
                    update={"nivel": competencia.nivel - 1}
                ))
                reducido = True
            else:
                ajustadas.append(competencia)
        caja = nine_box.calcular_nine_box(ajustadas)
        por_clave = {c.clave.value: c for c in ajustadas}
        columnas = {
            "empleado_id": empleado.id,
            "periodo": _periodo_anterior(periodo_actual()),
            "generado_por_cuenta_id": cuenta_rh.id,
            "empleado_nombre": empleado.nombre,
            "empleado_puesto": empleado.puesto,
            "empleado_area": empleado.area,
            "performance_axis": caja.performance_axis,
            "potential_axis": caja.potential_axis,
            "box_code": caja.box_code,
        }
        for codigo in COMPETENCIAS:
            competencia = por_clave[codigo]
            calculable = competencia.estado == EstadoCompetencia.CALCULABLE
            columnas[f"{codigo}_nivel"] = competencia.nivel if calculable else None
            columnas[f"{codigo}_status"] = competencia.estado.value
        db.add(Evaluacion(**columnas))

# ---------------------------------------------------------------------------
# Orquestación con barreras y punto de entrada
# ---------------------------------------------------------------------------


def cargar(db: Session, *, confirmado: bool) -> str:
    """Carga el dataset con todas las barreras. Devuelve un mensaje de resultado.

    - 'vacia' → crea el dataset;
    - 'demo' → no hace nada (idempotente);
    - 'ajena'/'inconsistente' → aborta SIN modificar la base.
    """
    if not confirmado:
        raise ConfirmacionFaltante(
            "Falta la confirmación explícita: ejecuta con --confirmar-demo."
        )
    estado = evaluar_estado(db)
    if estado == "demo":
        return (
            "El dataset de demostración ya existe completo: no se modificó "
            "nada (idempotente)."
        )
    if estado == "ajena":
        raise BaseConDatosAjenos(
            "La base contiene información AJENA al dataset de demostración. "
            "Abortando sin modificar nada. Usa una base vacía con prefijo "
            f"'{PREFIJO_BASE_DEMO}'."
        )
    if estado == "inconsistente":
        raise DatasetDemoInconsistente(
            "El contenido de la base no coincide con el dataset esperado "
            "(parcial, mutado o con datos huérfanos). Abortando sin "
            "modificar nada: revisa la base manualmente."
        )
    contados = cargar_dataset(db)
    detalle = ", ".join(f"{tabla}={total}" for tabla, total in contados.items())
    return f"Dataset de demostración creado ({detalle})."


def ejecutar(url: str | None = None, *, confirmado: bool) -> str:
    """Barreras completas + carga. Nunca usa el engine global de la app."""
    if es_entorno_de_produccion():
        raise EntornoDeProduccion(
            "APP_ENV=production: el seed de demostración no puede ejecutarse "
            "en un entorno identificado como producción."
        )
    from app.core.config import get_settings

    url_efectiva = url or get_settings().DATABASE_URL
    verificar_base_de_demostracion(nombre_de_la_base(url_efectiva))

    engine = create_engine(url_efectiva, pool_pre_ping=True)
    try:
        # Segunda barrera: el nombre REAL según el servidor (por si la URL
        # apuntara a otra base por proxies/redirecciones).
        from sqlalchemy import text

        with engine.connect() as conexion:
            nombre_real = conexion.execute(
                text("SELECT current_database()")
            ).scalar()
        verificar_base_de_demostracion(nombre_real)

        with Session(bind=engine) as db:
            return cargar(db, confirmado=confirmado)
    finally:
        engine.dispose()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.core.seed_demo",
        description=(
            "Seed OPCIONAL de datos sintéticos de demostración (base "
            f"'{PREFIJO_BASE_DEMO}*'; nunca producción). Alembic sigue "
            "siendo la fuente oficial del esquema."
        ),
    )
    parser.add_argument(
        "--confirmar-demo",
        action="store_true",
        help="Confirmación explícita de que se van a cargar datos de demo.",
    )
    argumentos = parser.parse_args(argv)
    try:
        mensaje = ejecutar(confirmado=argumentos.confirmar_demo)
    except ErrorSeedDemo as error:
        print(f"[seed_demo] ABORTADO: {error}")
        return 1
    print(f"[seed_demo] {mensaje}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())





