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
