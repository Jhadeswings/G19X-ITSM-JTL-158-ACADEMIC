// Proyectos del Empleado (PRD §11, §21.3; Especificación Técnica §6–§8, §31).
//
// Usa EXCLUSIVAMENTE los dos endpoints que el backend ya expone para el rol
// Empleado. NO existe (ni se inventa) un listado de proyectos del empleado:
//
// - GET  /api/v1/me/projects/search?nombre=  → ResultadoBusquedaOut
//        (`consulta_normalizada`, `coincidencia_exacta` y `sugerencias[]`
//        con `proyecto` + `similitud`);
// - POST /api/v1/me/projects                 → ProyectoOut (201).
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
// nunca un error). Los errores 401/409/422 llegan tal cual desde el cliente
// HTTP compartido, con su estado y su mensaje.

import { solicitar } from './clienteApi.js'

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
