// Alta de empleado por RH (PRD §3.3; Especificación Técnica §31).
//
// POST /api/v1/rh/employees crea Empleado + CuentaAcceso con credencial
// temporal en el backend: la credencial NUNCA viaja en la respuesta ni se
// solicita por otro endpoint (DECISIONES_TECNICAS.md §14). El frontend solo
// envía los datos que registra RH.
//
// Autorización: el token de la sesión RH viaja en la cabecera Authorization
// y el backend aplica require_rh en cada petición (ET §31/§32). Aquí no se
// decide ningún permiso.

import { solicitar } from './clienteApi.js'

/**
 * Crea un empleado con su cuenta de acceso.
 * @param {string} token token de la sesión RH.
 * @param {{nombre: string, email: string, puesto?: string|null,
 *          area?: string|null, fecha_ingreso?: string|null}} datos
 * @returns {Promise<object>} EmpleadoOut del backend (sin credenciales).
 */
export async function crearEmpleado(token, datos) {
  return solicitar('/api/v1/rh/employees', {
    metodo: 'POST',
    token,
    cuerpo: datos,
  })
}

// Detalle de un empleado por RH (PRD §20.1; Especificación Técnica §31).
//
// Usa EXCLUSIVAMENTE el endpoint existente GET /api/v1/rh/employees/{id},
// que devuelve el EmpleadoOut del backend sin transformar.

/**
 * Consulta un empleado por su identificador.
 * @param {string} token token de la sesión RH.
 * @param {number|string} empleadoId identificador del empleado (`empleado.id`).
 * @returns {Promise<object>} EmpleadoOut del backend, sin transformar.
 */
export async function obtenerEmpleado(token, empleadoId) {
  return solicitar(`/api/v1/rh/employees/${encodeURIComponent(empleadoId)}`, {
    token,
  })
}

// Listado administrativo de empleados (PRD §20.1; ET §31, §40).
//
// Usa EXCLUSIVAMENTE los parámetros que el backend ya acepta: `pagina`,
// `por_pagina`, `activo` y `area`. No se filtra por nombre ni por puesto
// porque el contrato no los expone, y no se calculan competencias ni niveles
// aquí: esas reglas viven en el backend (ET §42) y en otros módulos.
//
// `area` viaja tal cual: el backend aplica coincidencia EXACTA normalizada.
// El campo de la interfaz se presenta como filtro exacto, nunca como búsqueda
// general (no hay catálogo de áreas ni listado de coincidencias parciales).

/** Tope superior de `por_pagina` aceptado por el backend (evita un 422). */
export const POR_PAGINA_MAXIMO = 100

/** Valor por defecto del backend, reutilizado para no duplicar el contrato. */
export const POR_PAGINA_DEFECTO = 20

/** Normaliza los parámetros de la vista a query params, omitting los vacíos. */
function parametrosListado({ pagina, porPagina, activo, area }) {
  const consulta = new URLSearchParams()

  const paginaActual = Number.isFinite(pagina) ? Math.max(1, Math.trunc(pagina)) : 1
  const porPaginaActual = Number.isFinite(porPagina)
    ? Math.min(POR_PAGINA_MAXIMO, Math.max(1, Math.trunc(porPagina)))
    : POR_PAGINA_DEFECTO

  consulta.set('pagina', String(paginaActual))
  consulta.set('por_pagina', String(porPaginaActual))

  // `activo` solo viaja si el filtro está definido: `undefined` = sin filtro.
  if (activo === true || activo === false) {
    consulta.set('activo', String(activo))
  }
  const areaLimpia = typeof area === 'string' ? area.trim() : ''
  if (areaLimpia) {
    consulta.set('area', areaLimpia)
  }
  return consulta.toString()
}

/**
 * Lista empleados paginados con los filtros que el backend soporta.
 * @param {string} token token de la sesión RH.
 * @param {{pagina?: number, porPagina?: number, activo?: boolean|null,
 *          area?: string|null}} filtros
 * @returns {Promise<{total: number, pagina: number, por_pagina: number,
 *                    items: object[]}>} EmpleadoPageOut del backend, sin transformar.
 */
export async function listarEmpleados(token, filtros = {}) {
  return solicitar(`/api/v1/rh/employees?${parametrosListado(filtros)}`, { token })
}