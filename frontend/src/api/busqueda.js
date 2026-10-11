// Búsqueda manual de talento por RH (PRD §13.1; ET §26; Decisión Técnica #36).
//
// POST /api/v1/rh/talent-search/manual con EXACTAMENTE
// { competencies: [{ code, min_level }] }: el backend es la fuente de verdad y
// decide quién cumple (AND, solo activos, DI no satisface min_level) y en qué
// orden. Aquí NO se filtra, ordena ni recalcula nada.
//
// área/puesto NO viajan en el payload: BusquedaManualIn es extra="forbid" y
// los rechaza (Decisión Técnica #41 — son criterios informativos para la
// revisión de RH, no filtros ejecutables del contrato actual).

import { solicitar } from './clienteApi.js'

/**
 * Ejecuta la búsqueda manual con los criterios revisados por RH.
 * @param {string} token token de la sesión RH.
 * @param {Array<{code: string, min_level: number}>} criterios ≥ 1 criterio,
 *   sin códigos duplicados (el backend los rechaza con 422).
 * @returns {Promise<{total: number, criterios: object[], items: object[]}>}
 *   BusquedaManualOut del backend, sin transformar.
 */
export async function buscarTalento(token, criterios) {
  return solicitar('/api/v1/rh/talent-search/manual', {
    metodo: 'POST',
    token,
    cuerpo: {
      competencies: criterios.map((criterio) => ({
        code: criterio.code,
        min_level: criterio.min_level,
      })),
    },
  })
}

// ---------------------------------------------------------------------------
// Interpretación IA de la necesidad de RH (PRD §13.3; ET §27; DT #39).
//
// POST /api/v1/rh/talent-search/interpret con EXACTAMENTE { query_text }:
// la IA SOLO interpreta la intención de RH (jamás selecciona empleados ni
// calcula niveles) y devuelve criterios estructurados que RH revisa y
// modifica antes de ejecutar la búsqueda manual. El endpoint NO ejecuta
// ninguna búsqueda ni persiste nada.
// ---------------------------------------------------------------------------

/**
 * Interpreta la necesidad descrita por RH como criterios estructurados.
 * @param {string} token token de la sesión RH.
 * @param {string} queryText la necesidad de RH tal como la escribió: el
 *   backend la limpia con strip(), exige que no quede vacía y admite un
 *   máximo de 500 caracteres (fuera de eso responde 422).
 * @returns {Promise<{proveedor: string, criterios: {competencies:
 *   Array<{code: string, min_level: number}>, area: string|null,
 *   position: string|null}}>} InterpretacionOut del backend, sin
 *   transformar. `area`/`position` son contexto informativo para la
 *   revisión de RH (DT #41), NO filtros ejecutables.
 */
export async function interpretarBusqueda(token, queryText) {
  return solicitar('/api/v1/rh/talent-search/interpret', {
    metodo: 'POST',
    token,
    cuerpo: { query_text: queryText },
  })
}