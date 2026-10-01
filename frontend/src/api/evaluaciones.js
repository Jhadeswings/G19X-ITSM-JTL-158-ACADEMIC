// Evaluaciones oficiales históricas (PRD §20.2 Perfil individual de RH y §21.5
// "Mi historial" del Empleado; Especificación Técnica §31/§34/§36).
//
// Este módulo expone los DOS endpoints de solo lectura que el backend ya
// define, que comparten respuesta paginada y contrato de inmutabilidad:
//
//   - GET /api/v1/rh/employees/{id}/evaluations → EvaluacionPageOut
//     (historial de cualquier empleado, para RH; incluye 9-Box, §10);
//   - GET /api/v1/me/evaluations                 → EvaluacionEmpleadoPageOut
//     (historial del propio Empleado; SIN ejes ni 9-Box, §21).
//
// Ambos devuelven el HISTORIAL paginado ordenado por periodo DESC:
// `pagina=1&por_pagina=1` entrega `items[0]` = evaluación oficial más reciente.
// No existe (ni se necesita) un endpoint `latest`.
//
// Los snapshots históricos NUNCA se recalculan (§24, inmutabilidad garantizada
// en base de datos) y aquí no se transforman: estas funciones devuelven el
// JSON del backend tal cual.
//
// No hay POST, PATCH ni DELETE de evaluaciones: el backend no los expone y este
// módulo no los inventa.

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

/**
 * Historial de evaluaciones oficiales PROPIAS del Empleado ("Mi historial",
 * PRD §21.5; ET §31/§36 — GET /api/v1/me/evaluations).
 *
 * Es el equivalente del Empleado del endpoint anterior, con dos diferencias
 * que el backend ya garantiza y aquí NO se reconstruyen:
 *
 * 1. La identidad es la cuenta autenticada: `empleado_id` se deriva SIEMPRE del
 *    token (§32, anti-IDOR), por eso esta función NO acepta un `empleadoId`
 *    que la vista pudiera manipular.
 * 2. La respuesta es `EvaluacionEmpleadoPageOut`: el MISMO historial paginado
 *    pero SIN ejes ni 9-Box, porque el 9-Box es exclusivo de RH (§10). Este
 *    módulo no los añade ni los deriva.
 *
 * Cada evaluación es el snapshot histórico oficial capturado al generarse:
 * inmutable por trigger de base de datos (§24), nunca recalculado aquí. El
 * orden es el del backend (`periodo` DESC).
 *
 * El contrato es de solo lectura: no existen POST, PATCH ni DELETE sobre
 * `/me/evaluations`, así que aquí no hay función de modificación, edición ni
 * borrado. Tampoco hay filtro por periodo ni ningún otro parámetro: la ET §36
 * solo documenta `pagina` y `por_pagina`.
 *
 * Este módulo solo transporta: la respuesta llega sin transformar, sin
 * calcular niveles, etiquetas, promedios ni series temporales. Los errores
 * 401/404/422 llegan tal cual desde el cliente HTTP compartido.
 *
 * @param {string} token token de la sesión Empleado.
 * @param {{pagina?: number, porPagina?: number}} [paginación] opcional; sin
 *        argumentos se aplican los defaults del contrato (1 / 20).
 * @returns {Promise<{total: number, pagina: number, por_pagina: number,
 *                    items: object[]}>} EvaluacionEmpleadoPageOut sin transformar.
 */
export async function listarEvaluacionesPropias(token, { pagina, porPagina } = {}) {
  return solicitar(
    `/api/v1/me/evaluations?${parametrosListado({ pagina, porPagina })}`,
    { token },
  )
}
