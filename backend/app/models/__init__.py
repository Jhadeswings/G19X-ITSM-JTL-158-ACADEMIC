# Modelos SQLAlchemy (entidades de dominio).
#
# Entidades persistentes definidas por la Especificación Técnica v1.5 (§3):
#   CuentaAcceso, Empleado, Proyecto, Participacion, Capacitacion, Evaluacion,
#   AuditoriaModificacion.
#
# PROHIBIDO crear como entidades persistentes (§3, §18, §30, §44):
#   ResultadoActual, Alert, TalentScore, RankingTalento.
#
# El esquema evoluciona SOLO mediante Alembic (§1: prohibido create_all()).

from app.models.auditoria_modificacion import AuditoriaModificacion
from app.models.capacitacion import Capacitacion
from app.models.cuenta_acceso import CuentaAcceso
from app.models.empleado import Empleado
from app.models.evaluacion import Evaluacion
from app.models.participacion import Participacion
from app.models.proyecto import Proyecto
from app.models.token_recuperacion import TokenRecuperacion

__all__ = [
    "AuditoriaModificacion",
    "Capacitacion",
    "CuentaAcceso",
    "Empleado",
    "Evaluacion",
    "Participacion",
    "Proyecto",
    "TokenRecuperacion",
]
