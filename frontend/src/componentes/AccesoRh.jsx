// Pantalla temporal mínima para el rol RH (PRD §3.1 y §20).
//
// En esta etapa el frontend solo implementa la vista Empleado "Mi progreso"
// (PRD §21.2), por lo que RH no debe recibir esa vista. Aquí solamente se
// informa el estado actual del frontend y se permite cerrar sesión: NO es un
// Dashboard y no inventa módulos, métricas ni navegación.

import EstadoVacio from './EstadoVacio.jsx'

export default function AccesoRh() {
  return (
    <EstadoVacio
      titulo="Las vistas de RH todavía no están disponibles"
      descripcion="Tu cuenta tiene rol RH. En esta etapa el frontend solo incluye «Mi progreso», para el rol Empleado. Las vistas de RH (Empleados, Búsqueda, Mentoría, Brechas y Evaluaciones) se agregarán en etapas posteriores."
    />
  )
}
