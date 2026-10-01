// Capacitaciones propias del Empleado (PRD §21.4; Especificación Técnica §11,
// §31; DECISIONES_TECNICAS §21).
//
// Usa EXCLUSIVAMENTE los tres endpoints que el backend ya expone en el router
// `/me/trainings` (`me_capacitaciones.py`), protegido con `require_empleado`:
//   - POST /api/v1/me/trainings          → CapacitacionOut      (201)
//   - GET  /api/v1/me/trainings          → CapacitacionPageOut
//   - GET  /api/v1/me/trainings/{id}     → CapacitacionOut
//
// NO se implementa PATCH ni DELETE: ningún documento los define y
// DECISIONES_TECNICAS §21 los cierra expresamente ("NO existen PATCH, DELETE ni
// endpoints RH de capacitaciones"). Tampoco existe edición ni endpoints RH.
//
// El contrato de entrada (`CapacitacionCreateIn`, `extra="forbid"`) admite
// EXCLUSIVAMENTE `nombre`, `fecha` y `completado` (este último opcional, por
// defecto `false`). En consecuencia, aquí NUNCA se envía `empleado_id`: se
// deriva SIEMPRE de la cuenta autenticada (§32, anti-IDOR) y enviarlo produce
// un 422, igual que un `nombre` vacío o una `fecha` mal formada.
//
// El listado es PAGINADO (`CapacitacionPageOut { total, pagina, por_pagina,
// items[] }`), no una lista simple: `pagina >= 1` y `por_pagina` entre 1 y 100
// (default 20 en el backend). El orden (`fecha` DESC, `id` DESC) y el recorte
// los decide el backend. La lógica del año calendario local
// (America/Mexico_City) pertenece a `CompetencyEngine`, fase posterior: aquí NO
// se calcula nada.
//
// Este módulo solo transporta: no transforma la respuesta, no completa ni
// normaliza campos y no aplica reglas de negocio. Los errores 401/403/404/422
// llegan tal cual desde el cliente HTTP compartido, con su estado y su mensaje.

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
 * Lista paginada las capacitaciones propias del Empleado.
 *
 * El backend devuelve SOLO las capacitaciones del empleado autenticado, ya
 * paginadas y ordenadas (`fecha` DESC, `id` DESC). Aquí no se filtra, ordena ni
 * recorta nada: la respuesta llega tal cual.
 *
 * @param {string} token token de la sesión Empleado.
 * @param {{pagina?: number, porPagina?: number}} [parametros] paginación
 *        opcional; si se omite se piden los defaults del contrato (1 / 20).
 * @returns {Promise<{total: number, pagina: number, por_pagina: number,
 *                    items: object[]}>} CapacitacionPageOut sin transformar.
 */
export async function listarCapacitaciones(token, { pagina, porPagina } = {}) {
  return solicitar(
    `/api/v1/me/trainings?${parametrosListado({ pagina, porPagina })}`,
    { token },
  )
}

/**
 * Registra una capacitación propia (PRD §21.4: nombre, fecha, completado).
 *
 * El cuerpo viaja tal cual: NO se le añade `empleado_id` (lo deriva la cuenta
 * autenticada, §32) ni ningún otro campo. El backend responde 201 con
 * `CapacitacionOut`.
 *
 * @param {string} token token de la sesión Empleado.
 * @param {{nombre: string, fecha: string, completado?: boolean}} datos cuerpo
 *        de `CapacitacionCreateIn`. `fecha` es la fecha del curso en formato
 *        `YYYY-MM-DD`; `completado` es opcional y el backend lo fija en `false`.
 * @returns {Promise<object>} CapacitacionOut del backend, sin transformar.
 */
export async function crearCapacitacion(token, datos) {
  return solicitar('/api/v1/me/trainings', {
    metodo: 'POST',
    token,
    cuerpo: datos,
  })
}

/**
 * Consulta una capacitación propia por su identificador.
 *
 * Ownership estricto en backend (§32): una capacitación ajena responde 404 con
 * el mismo mensaje que una inexistente, nunca 403. Ese error se propaga tal cual.
 *
 * @param {string} token token de la sesión Empleado.
 * @param {number|string} capacitacionId `CapacitacionOut.id`.
 * @returns {Promise<object>} CapacitacionOut del backend, sin transformar.
 */
export async function consultarCapacitacion(token, capacitacionId) {
  return solicitar(
    `/api/v1/me/trainings/${encodeURIComponent(capacitacionId)}`,
    { token },
  )
}