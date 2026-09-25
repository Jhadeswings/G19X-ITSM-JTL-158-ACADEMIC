import { solicitar } from './clienteApi.js'

/**
 * Contratos mínimos del Dashboard RH. Los totales y la atención llegan
 * calculados por backend; el frontend solo presenta la respuesta.
 *
 * Nota de producto para este bloque: "proyectos activos" se consulta como
 * EN_PROCESO, porque es el estado operativo activo del proyecto. COMPLETADO
 * y CANCELADO no se incluyen.
 */
export function obtenerEmpleadosActivos(token) {
  return solicitar('/api/v1/rh/employees?activo=true&por_pagina=1', { token })
}

export function obtenerProyectosActivos(token) {
  return solicitar('/api/v1/rh/projects?estado=EN_PROCESO&por_pagina=1', { token })
}

export function obtenerAtencionRequerida(token) {
  return solicitar('/api/v1/rh/attention-required', { token })
}
