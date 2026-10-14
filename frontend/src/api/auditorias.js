// Consulta de auditoría de correcciones para RH (Tarea C; PRD §22; ET §25).
//
// Usa EXCLUSIVAMENTE el endpoint existente GET /api/v1/rh/audits
// (router `/rh/audits`, protegido con `require_rh`): lectura paginada de
// los registros ya existentes en AuditoriaModificacion.
//
// Este módulo solo transporta: no transforma la respuesta, no filtra, no
// ordena y no inventa campos. El orden (fecha DESC, id DESC) y la
// paginación los decide el backend; la autorización real también (aquí
// solo viaja el token). Los errores 401/422 llegan tal cual desde el
// cliente HTTP compartido, con su estado y su mensaje.
//
// La pantalla es de SOLO LECTURA: no existen POST/PATCH/DELETE de
// auditoría y aquí jamás se envía ningún cuerpo.

import { solicitar } from './clienteApi.js'

/** Tope de `por_pagina` del contrato (evita un 422). */
export const POR_PAGINA_MAXIMO = 100

/** Default de paginación del backend. */
export const POR_PAGINA_DEFECTO = 20

/**
 * Lista las auditorías registradas, paginadas.
 *
 * @param {string} token token de la sesión RH.
 * @param {{pagina?: number, porPagina?: number}} [paginacion]
 * @returns {Promise<{total: number, pagina: number, por_pagina: number,
 *                    items: object[]}>} AuditoriaPageOut sin transformar.
 */
export async function listarAuditorias(token, { pagina, porPagina } = {}) {
  const consulta = new URLSearchParams()
  const paginaActual = Number.isFinite(pagina) ? Math.max(1, Math.trunc(pagina)) : 1
  const porPaginaActual = Number.isFinite(porPagina)
    ? Math.min(POR_PAGINA_MAXIMO, Math.max(1, Math.trunc(porPagina)))
    : POR_PAGINA_DEFECTO
  consulta.set('pagina', String(paginaActual))
  consulta.set('por_pagina', String(porPaginaActual))
  return solicitar(`/api/v1/rh/audits?${consulta.toString()}`, { token })
}
