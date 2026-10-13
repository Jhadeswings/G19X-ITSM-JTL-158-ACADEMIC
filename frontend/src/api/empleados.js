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

// Resultado actual vigente de un empleado (PRD §9/§20.2; ET §31, §42).
//
// Usa EXCLUSIVAMENTE el endpoint existente GET /api/v1/rh/employees/{id}/result,
// que devuelve el ResultadoActualDTO del backend sin transformar: cinco
// competencias con `estado` (CALCULABLE | INSUFFICIENT_DATA), `nivel` nulo
// cuando es DI, experiencia como contexto, fortalezas y oportunidades.
//
// Es una lectura DINÁMICA del estado actual (nunca un snapshot histórico)
// y no se persiste nada. Aquí no se calcula ni se interpreta nada: el
// backend es el único dueño de las reglas (ET §13). Sin ramas por estado
// del empleado: el contrato es neutral respecto a `activo` (solo 404 si el
// empleado no existe).

/**
 * Consulta el resultado actual de un empleado (RH).
 * @param {string} token token de la sesión RH.
 * @param {number|string} empleadoId identificador del empleado (`empleado.id`).
 * @returns {Promise<object>} ResultadoActualDTO del backend, sin transformar.
 */
export async function obtenerResultadoActual(token, empleadoId) {
  return solicitar(
    `/api/v1/rh/employees/${encodeURIComponent(empleadoId)}/result`,
    { token },
  )
}

// 9-Box vigente de un empleado (PRD §10/§20.2; ET §20, §31, §42).
//
// Usa EXCLUSIVAMENTE el endpoint existente GET /api/v1/rh/employees/{id}/nine-box,
// que devuelve el NineBoxDTO del backend sin transformar: `performance_axis`,
// `potential_axis` y `box_code`, más las etiquetas de presentación
// `etiqueta_performance`/`etiqueta_potencial`. Los ejes llegan como texto
// (Decimal serializado por el backend) y se pintan tal cual: no se parsean,
// no se redondean ni se recalculan.
//
// Es un CONTRATO SEPARADO de `/result` a propósito (MB-4B): el 9-Box NO forma
// parte de ResultadoActualDTO y tampoco sustituye al 9-Box histórico del
// snapshot de una evaluación. Si cualquiera de las cinco competencias está en
// INSUFFICIENT_DATA, los cinco campos llegan `null` (§20.2): esa lectura la
// hace la vista, aquí no se interpreta nada. Sin cálculos ni ramas por estado
// del empleado: solo 404 si el empleado no existe, como `/result`.

/**
 * Consulta el 9-Box vigente de un empleado (RH).
 * @param {string} token token de la sesión RH.
 * @param {number|string} empleadoId identificador del empleado (`empleado.id`).
 * @returns {Promise<object>} NineBoxDTO del backend, sin transformar.
 */
export async function obtenerNineBox(token, empleadoId) {
  return solicitar(
    `/api/v1/rh/employees/${encodeURIComponent(empleadoId)}/nine-box`,
    { token },
  )
}

// Recomendación de desarrollo de un empleado (PRD v1.4 §20.2.1; ET v1.6 §31.1).
//
// Usa EXCLUSIVAMENTE el endpoint existente
// GET /api/v1/rh/employees/{id}/recommendation: ruta SEPARADA de
// /me/progress/recommendation (exclusiva del empleado). Devuelve
// `{ resultado_actual, recomendacion_ia }` sin transformar: `recomendacion_ia`
// trae `{ origen, proveedor, recommendation, actions }` o es `null` cuando la
// IA no está disponible — un estado CONTROLADO del backend (ET §38), no un
// error de esta capa. Solo transporte: aquí no se genera, reescribe ni
// interpreta texto de IA, y la vista decide cuándo consultar (demanda
// explícita de RH). Sin ramas por estado del empleado: mismo comportamiento
// que `/result`, solo 404 si el empleado no existe.

/**
 * Consulta la sugerencia de desarrollo con IA de un empleado (RH).
 * @param {string} token token de la sesión RH.
 * @param {number|string} empleadoId identificador del empleado (`empleado.id`).
 * @returns {Promise<object>} RecomendacionIAOut del backend, sin transformar.
 */
export async function obtenerRecomendacionDesarrollo(token, empleadoId) {
  return solicitar(
    `/api/v1/rh/employees/${encodeURIComponent(empleadoId)}/recommendation`,
    { token },
  )
}

// Listado administrativo de empleados (PRD §20.1; ET §31, §40).
//
// Usa EXCLUSIVAMENTE los parámetros que el backend acepta: `pagina`,
// `por_pagina`, `activo`, `area` y `q`. La BÚSQUEDA (`q`) es la del PRD §20.1
// por nombre/puesto: coincidencia parcial que ejecuta y resuelve el BACKEND;
// aquí no se filtra ni se ordena nada en el cliente. El filtro de Área sigue
// siendo coincidencia EXACTA normalizada (concepto distinto de la búsqueda).
// No se filtra por competencia ni nivel: el contrato no los expone (ET §42).
//
// `area` y `q` viajan tal cual: el backend normaliza ambos lados de cada
// comparación (el acento es significativo, sin `unaccent`).

/** Tope superior de `por_pagina` aceptado por el backend (evita un 422). */
export const POR_PAGINA_MAXIMO = 100

/** Valor por defecto del backend, reutilizado para no duplicar el contrato. */
export const POR_PAGINA_DEFECTO = 20

/** Normaliza los parámetros de la vista a query params, omitting los vacíos. */
function parametrosListado({ pagina, porPagina, activo, area, q }) {
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
  // La búsqueda solo viaja si quedó algo tras el trim: vacía = sin búsqueda.
  const busquedaLimpia = typeof q === 'string' ? q.trim() : ''
  if (busquedaLimpia) {
    consulta.set('q', busquedaLimpia)
  }
  return consulta.toString()
}

/**
 * Lista empleados paginados con los filtros que el backend soporta.
 * @param {string} token token de la sesión RH.
 * @param {{pagina?: number, porPagina?: number, activo?: boolean|null,
 *          area?: string|null, q?: string|null}} filtros
 * @returns {Promise<{total: number, pagina: number, por_pagina: number,
 *                    items: object[]}>} EmpleadoPageOut del backend, sin transformar.
 */
export async function listarEmpleados(token, filtros = {}) {
  return solicitar(`/api/v1/rh/employees?${parametrosListado(filtros)}`, { token })
}