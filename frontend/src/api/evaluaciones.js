// Evaluaciones oficiales de un empleado para RH (PRD §20.2 Perfil individual;
// Especificación Técnica §31/§34 — GET /api/v1/rh/employees/{id}/evaluations).
//
// El endpoint devuelve el HISTORIAL paginado ordenado por periodo DESC:
// `pagina=1&por_pagina=1` entrega `items[0]` = evaluación oficial más
// reciente. No existe (ni se necesita) un endpoint `latest`.
//
// Los snapshots históricos NUNCA se recalculan (§24 inmutabilidad) y aquí no
// se transforman: esta función devuelve el JSON del backend tal cual.

import { solicitar } from './clienteApi.js'

/** Tope superior de `por_pagina` aceptado por el backend (evita un 422). */
export const POR_PAGINA_MAXIMO = 100

/** Valor por defecto del backend, reutilizado para no duplicar el contrato. */
export const POR_PAGINA_DEFECTO = 20

/** Normaliza la paginación de la vista a query params del contrato. */
function parametrosListado({ pagina, porPagina } = {}) {
  const consulta = new URLSearchParams()

  const paginaActual = Number.isFinite(pagina) ? Math.max(1, Math.trunc(pagina)) : 1
  const porPaginaActual = Number.isFinite(porPagina)
    ? Math.min(POR_PAGINA_MAXIMO, Math.max(1, Math.trunc(porPagina)))
    : POR_PAGINA_DEFECTO

  consulta.set('pagina', String(paginaActual))
  consulta.set('por_pagina', String(porPaginaActual))
  return consulta.toString()
}

/**
 * Lista las evaluaciones oficiales de un empleado (RH).
 *
 * Para la "Última evaluación" del perfil basta `{ pagina: 1, porPagina: 1 }`:
 * el orden del backend (periodo DESC) garantiza que `items[0]` es la más
 * reciente y `total` informa cuántas existen.
 *
 * @param {string} token token de la sesión RH.
 * @param {number|string} empleadoId identificador del empleado (`empleado.id`).
 * @param {{pagina?: number, porPagina?: number}} paginación
 * @returns {Promise<{total: number, pagina: number, por_pagina: number,
 *                    items: object[]}>} EvaluacionPageOut del backend, sin transformar.
 */
export async function listarEvaluacionesEmpleado(
  token,
  empleadoId,
  { pagina, porPagina } = {},
) {
  return solicitar(
    `/api/v1/rh/employees/${encodeURIComponent(empleadoId)}/evaluations` +
      `?${parametrosListado({ pagina, porPagina })}`,
    { token },
  )
}
