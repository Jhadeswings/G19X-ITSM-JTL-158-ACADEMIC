"""Modelo Evaluacion (snapshot histórico oficial e inmutable).

Especificación Técnica v1.5 §21, §23, §24:
- Campos: id, empleado_id, periodo (YYYY-QN), cinco competencias históricas,
  ejes 9-Box históricos cuando sean calculables, timestamp de generación y
  cuenta RH que ejecutó la generación.
- UNIQUE(empleado_id, periodo) (§23).
- Los niveles históricos son valores capturados al momento de la generación;
  no se recalculan al consultar el histórico.
- Inmutabilidad (§24): además de no existir endpoints de modificación, la
  migración crea un trigger PostgreSQL que rechaza UPDATE y DELETE.
- Representación de nivel (§14): ``nivel`` INTEGER NULL + ``status``
  CALCULABLE | INSUFFICIENT_DATA, con CHECK de consistencia.
- Ejes con Numeric(4,3) para preservar precisión decimal (§20.2).
"""

from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

# Códigos de las cinco competencias (PRD v1.3 / Especificación §16)
COMPETENCIAS = (
    "desempeno_tecnico",
    "liderazgo",
    "trabajo_equipo",
    "comunicacion",
    "aprendizaje",
)


def _competencia_checks(codigo: str) -> tuple[CheckConstraint, CheckConstraint]:
    """CHECK estáticos por competencia (§14 y §33: sin funciones temporales)."""
    nivel = f"{codigo}_nivel"
    status = f"{codigo}_status"
    return (
        CheckConstraint(
            f"{nivel} IS NULL OR {nivel} BETWEEN 1 AND 5",
            name=f"{codigo}_nivel_rango",
        ),
        CheckConstraint(
            f"(({status} = 'CALCULABLE' AND {nivel} IS NOT NULL) OR "
            f"({status} = 'INSUFFICIENT_DATA' AND {nivel} IS NULL))",
            name=f"{codigo}_status_coherente",
        ),
    )


class Evaluacion(Base):
    __tablename__ = "evaluaciones"

    id: Mapped[int] = mapped_column(primary_key=True)
    empleado_id: Mapped[int] = mapped_column(
        ForeignKey("empleados.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    # RH-01.1: identificación del empleado CAPTURADA al generar el snapshot
    # (fotografía histórica, §21). Nunca se resuelve al leer: si el empleado
    # cambia de puesto o área después, el histórico conserva el dato del
    # momento de la evaluación y las lecturas no mezclan tiempos.
    # ``empleado_puesto``/``empleado_area`` son NULL cuando el empleado no los
    # tenía al generarse (profile_incomplete §30): no se inventan. Las tres
    # columnas son NULLABLE para no invalidar snapshots anteriores a RH-01.1;
    # a partir de RH-01.1 la generación siempre las escribe.
    empleado_nombre: Mapped[str | None] = mapped_column(String(255), nullable=True)
    empleado_puesto: Mapped[str | None] = mapped_column(String(255), nullable=True)
    empleado_area: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Formo YYYY-QN (§21). El periodo actual lo determina la aplicación (§22).
    periodo: Mapped[str] = mapped_column(String(7), nullable=False, index=True)

    # Cinco competencias históricas (§21)
    desempeno_tecnico_nivel: Mapped[int | None] = mapped_column(Integer, nullable=True)
    desempeno_tecnico_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="CALCULABLE"
    )
    liderazgo_nivel: Mapped[int | None] = mapped_column(Integer, nullable=True)
    liderazgo_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="CALCULABLE"
    )
    trabajo_equipo_nivel: Mapped[int | None] = mapped_column(Integer, nullable=True)
    trabajo_equipo_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="CALCULABLE"
    )
    comunicacion_nivel: Mapped[int | None] = mapped_column(Integer, nullable=True)
    comunicacion_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="CALCULABLE"
    )
    aprendizaje_nivel: Mapped[int | None] = mapped_column(Integer, nullable=True)
    aprendizaje_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="CALCULABLE"
    )

    # Ejes 9-Box históricos cuando sean calculables (§20, §21); NULL si
    # cualquier competencia quedó en INSUFFICIENT_DATA.
    performance_axis: Mapped[float | None] = mapped_column(
        Numeric(4, 3), nullable=True
    )
    potential_axis: Mapped[float | None] = mapped_column(
        Numeric(4, 3), nullable=True
    )
    box_code: Mapped[str | None] = mapped_column(String(16), nullable=True)

    generado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    generado_por_cuenta_id: Mapped[int] = mapped_column(
        ForeignKey("cuentas_acceso.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    empleado: Mapped["Empleado"] = relationship()
    generado_por: Mapped["CuentaAcceso"] = relationship()

    __table_args__ = (
        # §23: constraint obligatorio una evaluación por empleado/periodo
        UniqueConstraint("empleado_id", "periodo", name="uq_evaluaciones_empleado_periodo"),
        # §21: periodo con formato YYYY-QN (estático, §22/§33: sin CURRENT_DATE)
        CheckConstraint(
            "periodo ~ '^[0-9]{4}-Q[1-4]$'", name="periodo_formato"
        ),
        *_competencia_checks("desempeno_tecnico"),
        *_competencia_checks("liderazgo"),
        *_competencia_checks("trabajo_equipo"),
        *_competencia_checks("comunicacion"),
        *_competencia_checks("aprendizaje"),
    )
