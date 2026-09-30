"""NineBoxService: 9-Box vigente de UN empleado (exclusivo RH).

Especificación Técnica v1.5 §20 (9-Box service) y §13 (único dueño de las
fórmulas); PRD v1.3 §10 ("visible exclusivamente para RH") y §20.2.

- Expone los EJES Y LA CELDA derivados del ESTADO ACTUAL del empleado. No es
  un snapshot: se deriva bajo demanda desde las competencias vigentes, igual
  que el bloque "Resultado actual" con sus niveles.
- SEPARACIÓN DE CONTRATOS: el 9-Box NO forma parte de ``ResultadoActualDTO``
  (``resultado_actual_service`` lo documenta explícitamente). Vive en su
  propio endpoint para no contaminar ese contrato ni el de la IA.
- CERO fórmulas duplicadas (§13): compone DOS piezas existentes y no decide
  nada. ``calcular_nine_box`` sigue siendo el único dueño de los ejes, de la
  celda y de los rangos; ``obtener_resultado_actual`` el único dueño del
  cálculo vigente de competencias. Aquí no hay umbrales ni etiquetas propias.
- DI se preserva: si CUALQUIERA de las cinco competencias está en
  ``INSUFFICIENT_DATA`` (§20.2), ``calcular_nine_box`` devuelve el
  ``NineBoxDTO`` vacío. DI nunca se convierte en nivel 0 ni en celda (§14).
- No recalcula ni reescribe el 9-Box histórico de una evaluación: aquel se
  calcula al generar el snapshot y se lee de la tabla (DECISIONES §30).
- Sin IA: la celda se deriva únicamente de los ejes (§20.3).

Sin reglas especiales por estado del empleado: el PRD y la Especificación no
definen condiciones ligadas a ``Empleado.activo``, igual que el resultado
actual. La única respuesta especial es la inexistencia del empleado (404).
"""

from sqlalchemy.orm import Session

from app.schemas.evaluacion import NineBoxDTO
from app.services.nine_box import calcular_nine_box
from app.services.resultado_actual_service import obtener_resultado_actual


def obtener_nine_box_actual(db: Session, empleado_id: int) -> NineBoxDTO:
    """Ejes y celda 9-Box derivados del estado ACTUAL del empleado.

    ``empleado_id`` proviene de la ruta (RH autenticado, ET §31): el cliente
    nunca envía niveles ni celdas. El 404 del empleado inexistente lo hereda
    de ``obtener_resultado_actual`` (mismo patrón que ``/result``).
    """
    resultado = obtener_resultado_actual(db, empleado_id)
    # Reutiliza el servicio puro (§13): aquí no se recalcula ninguna fórmula.
    return calcular_nine_box(resultado.competencias)