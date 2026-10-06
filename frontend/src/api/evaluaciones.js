// Evaluaciones oficiales históricas (PRD §20.2 Perfil individual de RH, §20.8
// Evaluaciones y §21.5 "Mi historial" del Empleado; Especificación Técnica
// §23/§24/§31/§34/§36).
//
// Este módulo expone los endpoints que el backend YA define, que comparten
// respuesta paginada y contrato de inmutabilidad:
//
//   - GET  /api/v1/rh/evaluations            → EvaluacionPageOut
//     (historial global de RH, filtros `periodo`; ET §31/DECISIONES §34);
//   - POST /api/v1/rh/evaluations/generate   → GeneracionEvaluacionesOut
//     (generación atómica del periodo VIGENTE resuelto por el backend, ET §23:
//     el cliente NO envía ni calcula el periodo);
//   - GET  /api/v1/rh/employees/{id}/evaluations → EvaluacionPageOut
//     (historial de cualquier empleado, para RH; incluye 9-Box, §10);
//   - GET  /api/v1/me/evaluations            → EvaluacionEmpleadoPageOut
//     (historial del propio Empleado; SIN ejes ni 9-Box, §21).
//
// Los GET devuelven el HISTORIAL paginado ordenado por periodo DESC:
// `pagina=1&por_pagina=1` entrega `items[0]` = evaluación oficial más reciente.
// No existe (ni se necesita) un endpoint `latest`.
//
// Los snapshots históricos NUNCA se recalculan (§24, inmutabilidad garantizada
// en base de datos) y aquí no se transforman: estas funciones devuelven el
// JSON del backend tal cual.
//
// No hay PATCH ni DELETE de evaluaciones: el backend no los expone y este
// módulo no los inventa. El ÚNICO POST es `/evaluations/generate` (ET §31),
// que crea snapshots nuevos del periodo vigente; no modifica los existentes.

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

/**
 * Patrón EXACTO del query param `periodo` del backend
 * (`^[0-9]{4}-Q[1-4]$`, rh_evaluations.PATRON_PERIODO). El backend lo valida
 * y responde 422 si no coincide; esta constante existe para que la vista pueda
 * avisar ANTES de hacer la petición, sin duplicar la regla en otro formato.
 */
export const PATRON_PERIODO = /^[0-9]{4}-Q[1-4]$/

/**
 * Historial global de evaluaciones oficiales para RH (PRD §20.8; ET §31 —
 * GET /api/v1/rh/evaluations).
 *
 * Usa el endpoint de listado GLOBAL ya implementado, con los parámetros que el
 * backend acepta: `pagina`, `por_pagina` y el filtro opcional `periodo`
 * (`YYYY-QN`, validado allí con su patrón). El filtro `empleado_id` que el
 * contrato también admite queda fuera de esta función de momento: la vista de
 * Evaluaciones consulta el historial completo del periodo, y el detalle por
 * empleado ya tiene su propio endpoint (`listarEvaluacionesEmpleado`).
 *
 * La respuesta es `EvaluacionPageOut` con `EvaluacionOut` COMPLETO (incluye
 * `nine_box`, exclusivo de RH según PRD §10) y llega sin transformar: aquí no
 * se calculan niveles, ejes, celdas ni promedios. Orden del backend: periodo
 * DESC. Solo lectura: no existe POST/PATCH/DELETE sobre este listado.
 *
 * @param {string} token token de la sesión RH.
 * @param {{pagina?: number, porPagina?: number, periodo?: string|null}} [filtros]
 *        `periodo` opcional; si se omite o viene vacío NO viaja en la URL.
 * @returns {Promise<{total: number, pagina: number, por_pagina: number,
 *                    items: object[]}>} EvaluacionPageOut sin transformar.
 */
export async function listarEvaluaciones(token, { pagina, porPagina, periodo } = {}) {
  const consulta = new URLSearchParams(parametrosListado({ pagina, porPagina }))
  const periodoLimpio = typeof periodo === 'string' ? periodo.trim() : ''
  if (periodoLimpio) {
    consulta.set('periodo', periodoLimpio)
  }
  return solicitar(`/api/v1/rh/evaluations?${consulta.toString()}`, { token })
}

/**
 * Genera las evaluaciones oficiales del periodo VIGENTE (PRD §20.8; ET §23 —
 * POST /api/v1/rh/evaluations/generate).
 *
 * El backend resuelve él mismo el periodo con su fecha de negocio
 * (America/Mexico_City) y lo devuelve en la respuesta: este módulo NO envía
 * ni calcula ningún periodo (ET §22/§23, DECISIONES §31).
 *
 * Códigos que la vista debe distinguir (DECISIONES §34):
 * - 201 → `total_generadas > 0`; 200 → `total_generadas = 0` (no hay
 *   empleados activos, no se inventa ninguna evaluación);
 * - 409 → el periodo ya fue generado (el `detail` del backend lo indica).
 *
 * Es el ÚNICO POST del módulo y NO modifica evaluaciones existentes: solo
 * inserta snapshots nuevos (§24 — siguen sin existir PATCH ni DELETE).
 *
 * @param {string} token token de la sesión RH.
 * @returns {Promise<{periodo: string, total_generadas: number,
 *                    items: object[]}>} GeneracionEvaluacionesOut sin transformar.
 */
export async function generarEvaluaciones(token) {
  return solicitar('/api/v1/rh/evaluations/generate', {
    metodo: 'POST',
    token,
  })
}
