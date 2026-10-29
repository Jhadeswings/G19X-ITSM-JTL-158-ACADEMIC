"""rh01.1 evaluaciones identificacion historica

Revision ID: b7c1e9f2a4d3
Revises: 938cef8a3bac
Create Date: 2026-10-05 22:19:00.000000

RH-01.1: añade a ``evaluaciones`` la identificación del empleado CAPTURADA
al generar el snapshot: ``empleado_nombre``, ``empleado_puesto`` y
``empleado_area``. Con esto las lecturas históricas no necesitan consultar el
empleado actual (nunca se mezcla una evaluación de un periodo con el
puesto/área de hoy).

Notas:
- Es solo DDL (ADD COLUMN): el trigger ``trg_evaluaciones_inmutable`` rechaza
  UPDATE/DELETE de filas, no ALTER TABLE, así que no interfiere.
- Las columnas son NULLABLE a propósito: los snapshots generados antes de
  RH-01.1 siguen válidos (sus lecturas exponen ``null`` y el cliente no debe
  inventar valores), y ``empleado_puesto``/``empleado_area`` también son
  ``null`` cuando el empleado estaba en ``profile_incomplete`` (§30).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c1e9f2a4d3'
down_revision: Union[str, None] = '938cef8a3bac'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'evaluaciones',
        sa.Column('empleado_nombre', sa.String(length=255), nullable=True),
    )
    op.add_column(
        'evaluaciones',
        sa.Column('empleado_puesto', sa.String(length=255), nullable=True),
    )
    op.add_column(
        'evaluaciones',
        sa.Column('empleado_area', sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('evaluaciones', 'empleado_area')
    op.drop_column('evaluaciones', 'empleado_puesto')
    op.drop_column('evaluaciones', 'empleado_nombre')
