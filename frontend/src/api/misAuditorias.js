// Historial de correcciones de MIS participaciones para el Empleado.
// (Equivale a GET /rh/audits de RH, acotado por ownership; PRD §22, ET §25/§32).
//
// Igual que el módulo de auditoría de RH, aquí solo se TRANSPORTA: ruta exacta
// GET /api/v1/me/audits con `pagina`/`por_pagina` y el token de la sesión. El
// backend deriva el empleado de la cuenta autenticada, filtra por SUS
// participaciones y decide el orden (fecha DESC, id DESC) y la paginación;
// este módulo NO transforma, NO filtra en el cliente ni inventa campos. Los
// errores 401/403/422 llegan tal cual desde el cliente HTTP compartido, con su
// estado y su mensaje, para que la vista decida (401 → sesión expirada).
//
// La pantalla es de SOLO LECTURA: no existe POST/PATCH/DELETE sobre auditoría
// y aquí jamás se envía un cuerpo.

import { solicitar } from './clienteApi.js'

/** Tope de `por_pagina` del contrato (evita un 422). */
export const POR_PAGINA_MAXIMO = 100

/** Default de paginación del backend. */
export const POR_PAGINA_DEFECTO = 20

/**
 * Lista las correcciones administrativas de MIS participaciones, paginadas.
 *
 * @param {string} token token de la sesión del Empleado.
 * @param {{pagina?: number, porPagina?: number}} [paginacion]
 * @returns {Promise<{total: number, pagina: number, por_pagina: number,
 *                    items: object[]}>} AuditoriaPageOut sin transformar.
 */
export async function listarMisAuditorias(token, { pagina, porPagina } = {}) {
  const consulta = new URLSearchParams()
  const paginaActual = Number.isFinite(pagina) ? Math.max(1, Math.trunc(pagina)) : 1
  const porPaginaActual = Number.isFinite(porPagina)
    ? Math.min(POR_PAGINA_MAXIMO, Math.max(1, Math.trunc(porPagina)))
    : POR_PAGINA_DEFECTO
  consulta.set('pagina', String(paginaActual))
  consulta.set('por_pagina', String(porPaginaActual))
  return solicitar(`/api/v1/me/audits?${consulta.toString()}`, { token })
}
