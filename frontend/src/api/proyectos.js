// Proyectos del Empleado (PRD §11, §21.1, §21.3; Especificación Técnica §6–§8, §31).
//
// Usa EXCLUSIVAMENTE los endpoints que el backend expone para el rol Empleado:
// - GET  /api/v1/me/projects?pagina=&por_pagina= → ProyectoPageOut
//        Listado de los proyectos del catálogo en los que el empleado tiene
//        PARTICIPACIÓN. La pertenencia la decide el backend por la relación
//        `participaciones`: aquí no se filtra ni se cruza nada.
// - GET  /api/v1/me/projects/search?nombre=  → ResultadoBusquedaOut
//        (`consulta_normalizada`, `coincidencia_exacta` y `sugerencias[]`
//        con `proyecto` + `similitud`);
// - POST /api/v1/me/projects                 → ProyectoOut (201).
//
// Ninguna función acepta `empleado_id`: la identidad la deriva siempre el
// backend del token (ET §32, anti-IDOR). Por eso el parámetro no existe aquí.
//
// Las reglas viven en el backend y aquí NO se replican: normalización del
// nombre (§7), unicidad por `nombre_normalizado` (§6.1), umbral de similitud
// 0.30 y máximo de 5 sugerencias (§8), alta siempre en EN_PROCESO (§6) y
// rechazo del duplicado exacto con 409. La búsqueda exige `nombre`
// (Query(..., min_length=1)): enviar la consulta vacía no es una opción del
// contrato, es responsabilidad de la vista no dispararla.
//
// Este módulo solo transporta: no transforma, no filtra, no ordena y no
// reinterpreta las respuestas (la coincidencia aproximada es información y
// nunca un error). El ORDER BY del listado es del backend. Los errores
// 401/409/422 llegan tal cual desde el cliente HTTP compartido, con su estado
// y su mensaje.

import { solicitar } from './clienteApi.js'

/**
 * Lista los proyectos propios del Empleado autenticado (ET §31, PRD §21.1).
 * @param {string} token token de la sesión Empleado.
 * @param {{pagina?: number, por_pagina?: number}} [opciones] paginación
 *   opcional; si se omite, el backend aplica su paginado por defecto.
 * @returns {Promise<object>} ProyectoPageOut del backend
 *   (`{ total, pagina, por_pagina, items }`), sin transformar.
 */
export async function listarMisProyectos(token, opciones = {}) {
  const parametros = new URLSearchParams()
  if (opciones.pagina !== undefined) {
    parametros.set('pagina', String(opciones.pagina))
  }
  if (opciones.por_pagina !== undefined) {
    parametros.set('por_pagina', String(opciones.por_pagina))
  }
  const query = parametros.toString()
  const ruta = query
    ? `/api/v1/me/projects?${query}`
    : '/api/v1/me/projects'
  return solicitar(ruta, { token })
}

/**
 * Busca proyectos por nombre (búsqueda obligatoria antes de crear, PRD §11.1).
 * @param {string} token token de la sesión Empleado.
 * @param {string} nombre nombre tal como lo escribe la persona usuaria
 *   (el backend normaliza y decide la coincidencia exacta y las sugerencias).
 * @returns {Promise<object>} ResultadoBusquedaOut del backend, sin transformar.
 */
export async function buscarProyectos(token, nombre) {
  return solicitar(
    `/api/v1/me/projects/search?nombre=${encodeURIComponent(nombre)}`,
    { token },
  )
}

/**
 * Crea un proyecto nuevo del catálogo compartido (siempre EN_PROCESO, §6).
 * @param {string} token token de la sesión Empleado.
 * @param {{nombre: string, area?: string|null, cliente?: string|null}} datos
 *   campos del contrato ProyectoCreateIn. El `estado` NO se envía: lo fija el
 *   backend.
 * @returns {Promise<object>} ProyectoOut del backend, sin transformar.
 */
export async function crearProyecto(token, datos) {
  return solicitar('/api/v1/me/projects', {
    metodo: 'POST',
    token,
    cuerpo: datos,
  })
}

// ---------------------------------------------------------------------------
// RH — administración de proyectos EXISTENTES (PRD §20.3 y §11.1; ET §31;
// DECISIONES_TECNICAS §15).
//
// RH NO crea proyectos: no existe POST /rh/projects (responde 405) y este
// módulo no lo expone. La creación pertenece al flujo del Empleado de arriba.
//
//   - GET   /api/v1/rh/projects      → ProyectoPageOut (paginado);
//   - GET   /api/v1/rh/projects/{id} → ProyectoOut (404 si no existe);
//   - PATCH /api/v1/rh/projects/{id} → ProyectoOut. Editables EXACTAMENTE
//     `nombre`, `area`, `cliente` y `estado` (ProyectoUpdateIn, todos
//     opcionales): el backend renormaliza el nombre (§7/§11.2), responde
//     409 si el nombre normalizado ya existe en otro proyecto, 422 si el
//     estado no es uno de los tres oficiales y 422 sin ningún campo.
//     `id`, `nombre_normalizado` y las fechas NUNCA se envían.
//
// La vista decide qué campos cambiaron; aquí solo se transportan tal cual.
// ---------------------------------------------------------------------------

/** Tope de `por_pagina` aceptado por el backend (evita un 422). */
export const POR_PAGINA_MAXIMO_RH = 100

/** Default de paginación del backend para el listado RH. */
export const POR_PAGINA_DEFECTO_RH = 20

/** Normaliza la paginación de la vista a query params del contrato. */
function parametrosRh({ pagina, porPagina } = {}) {
  const consulta = new URLSearchParams()
  const paginaActual = Number.isFinite(pagina) ? Math.max(1, Math.trunc(pagina)) : 1
  const porPaginaActual = Number.isFinite(porPagina)
    ? Math.min(POR_PAGINA_MAXIMO_RH, Math.max(1, Math.trunc(porPagina)))
    : POR_PAGINA_DEFECTO_RH
  consulta.set('pagina', String(paginaActual))
  consulta.set('por_pagina', String(porPaginaActual))
  return consulta.toString()
}

/**
 * Lista el catálogo compartido de proyectos (RH, PRD §20.3; ET §31 —
 * GET /api/v1/rh/projects).
 *
 * El contrato también admite los filtros `estado` y `area`; la vista de RH
 * no los usa de momento y esta función no los envía.
 *
 * @param {string} token token de la sesión RH.
 * @param {{pagina?: number, porPagina?: number}} [paginacion]
 * @returns {Promise<{total: number, pagina: number, por_pagina: number,
 *                    items: object[]}>} ProyectoPageOut sin transformar.
 */
export async function listarProyectosRh(token, { pagina, porPagina } = {}) {
  return solicitar(`/api/v1/rh/projects?${parametrosRh({ pagina, porPagina })}`, {
    token,
  })
}

/**
 * Consulta un proyecto del catálogo (RH; ET §31 — GET /api/v1/rh/projects/{id}).
 *
 * @param {string} token token de la sesión RH.
 * @param {number|string} proyectoId identificador del proyecto.
 * @returns {Promise<object>} ProyectoOut sin transformar (404 si no existe).
 */
export async function consultarProyectoRh(token, proyectoId) {
  return solicitar(`/api/v1/rh/projects/${encodeURIComponent(proyectoId)}`, {
    token,
  })
}

/**
 * Edición administrativa de un proyecto EXISTENTE (RH; ET §31 —
 * PATCH /api/v1/rh/projects/{id}).
 *
 * `cambios` debe contener SOLO los campos editables del contrato que la
 * vista detecte modificados (`nombre`, `area`, `cliente`, `estado`); el
 * backend responde 422 si no viaja ninguno. Nada más se envía jamás.
 *
 * @param {string} token token de la sesión RH.
 * @param {number|string} proyectoId identificador del proyecto.
 * @param {{nombre?: string, area?: string|null, cliente?: string|null,
 *          estado?: string}} cambios campos modificados, sin transformar.
 * @returns {Promise<object>} ProyectoOut actualizado, sin transformar.
 */
export async function actualizarProyectoRh(token, proyectoId, cambios) {
  return solicitar(`/api/v1/rh/projects/${encodeURIComponent(proyectoId)}`, {
    metodo: 'PATCH',
    token,
    cuerpo: cambios,
  })
}
