// Participaciones propias del Empleado (PRD §12, §21.3; Especificación §9, §31).
//
// Usa EXCLUSIVAMENTE el endpoint existente POST /api/v1/me/participations
// (router `/me/participations`, protegido con `require_empleado`).
//
// El contrato de entrada (`ParticipacionCreateIn`, `extra="forbid"`) SOLO
// admite ocho campos: `proyecto_id`, `rol`, `entregables`, `en_equipo`,
// `coordino_tareas`, `explico_a_publico_distinto`, `resolvio_problema` y
// `horas`. En consecuencia, aquí NUNCA se envía:
// - `empleado_id`: se deriva SIEMPRE de la cuenta autenticada (§32, anti-IDOR);
// - `fecha_registro`: la fija el servidor con la fecha de negocio
//   (America/Mexico_City);
// - `estado`: no forma parte del contrato de una participación.
// Cualquier campo extra produciría un 422 en el backend.
//
// Este módulo solo transporta: no transforma la respuesta, no calcula nada y
// no completa campos por su cuenta. Los errores 401/404/409/422 llegan tal
// cual desde el cliente HTTP compartido, con su estado y su mensaje.
//
// La consulta (GET) de participaciones existe para la detección de
// participación existente (MB-5B-3A); el detalle completo (MB-5B-3B) sigue
// POSPUESTO por ambigüedad documental: no tiene entrada de navegación (Style
// Guide §10), ni definición en el PRD (§21.3), ni contrato de frontend. No se
// inventa aquí.
//
// La edición (PATCH, MB-5B-2) usa el `id` que YA entrega el GET de MB-5B-3A:
// no requiere ningún endpoint nuevo.

import { solicitar } from './clienteApi.js'

/**
 * Registra la participación propia en un proyecto (registro inicial completo).
 * @param {string} token token de la sesión Empleado.
 * @param {{proyecto_id: number, rol: string, entregables?: string|null,
 *          en_equipo?: boolean, coordino_tareas?: boolean,
 *          explico_a_publico_distinto?: boolean, resolvio_problema?: boolean,
 *          horas: number}} datos payload exacto de ParticipacionCreateIn.
 * @returns {Promise<object>} ParticipacionOut del backend, sin transformar.
 */
export async function crearParticipacion(token, datos) {
  return solicitar('/api/v1/me/participations', {
    metodo: 'POST',
    token,
    cuerpo: datos,
  })
}

/**
 * Listado paginado de las participaciones propias (MB-5B-3A, detección de
 * participación existente; ET §31 `GET /me/participations`).
 *
 * Contrato real: `pagina >= 1`, `por_pagina` 1..100 (default 20) y respuesta
 * `ParticipacionPageOut { total, pagina, por_pagina, items[] }` con las
 * participaciones SOLO del empleado autenticado (orden `fecha_registro` DESC)
 * y `proyecto` incluido en cada item. Aquí se piden 100 por página para
 * cubrir el total en la menor cantidad de llamadas; filtrar por `proyecto_id`
 * es responsabilidad de quien llama: el endpoint NO admite ese filtro.
 *
 * Este módulo solo transporta: la respuesta llega sin transformar y los
 * errores 401/422 llegan tal cual desde el cliente HTTP compartido.
 *
 * @param {string} token token de la sesión Empleado.
 * @param {{pagina?: number, por_pagina?: number}} [parametros] paginación.
 * @returns {Promise<object>} ParticipacionPageOut del backend, sin transformar.
 */
export async function listarParticipaciones(
  token,
  { pagina = 1, por_pagina = 100 } = {},
) {
  return solicitar(
    `/api/v1/me/participations?pagina=${encodeURIComponent(
      pagina,
    )}&por_pagina=${encodeURIComponent(por_pagina)}`,
    { token },
  )
}

/**
 * Edición controlada de la participación propia (MB-5B-2; PRD §12.1, ET §9.1).
 *
 * Contrato real `ParticipacionEmpleadoUpdateIn` (`extra="forbid"`): el cuerpo
 * admite EXCLUSIVAMENTE `rol`, `entregables` y `horas`, los tres opcionales.
 * Cualquier otro campo —`proyecto_id`, `empleado_id`, `fecha_registro`,
 * `en_equipo`, `coordino_tareas`, `explico_a_publico_distinto`,
 * `resolvio_problema`— es un campo bloqueado y el backend responde **422**; por
 * eso aquí nunca se añaden al cuerpo. `proyecto_id` no se envía porque la
 * participación sigue siendo la del mismo proyecto: la relación es inmutable.
 *
 * El `participacionId` es el `id` de la participación EXISTENTE (el que entrega
 * `listarParticipaciones` en MB-5B-3A), nunca el `id` del proyecto.
 *
 * Errores del contrato: 401 (sesión), 404 (participación ajena o inexistente,
 * uniforme por ownership §32), 422 (cuerpo vacío o campo bloqueado) y 5xx. Se
 * propagan tal cual, con su estado y su mensaje.
 *
 * @param {string} token token de la sesión Empleado.
 * @param {number|string} participacionId id de la participación a editar.
 * @param {{rol?: string, entregables?: string|null, horas?: number}} datos
 *        cuerpo de `ParticipacionEmpleadoUpdateIn`, sin ningún otro campo.
 * @returns {Promise<object>} ParticipacionOut del backend, sin transformar.
 */
export async function actualizarParticipacion(token, participacionId, datos) {
  return solicitar(
    `/api/v1/me/participations/${encodeURIComponent(participacionId)}`,
    {
      metodo: 'PATCH',
      token,
      cuerpo: datos,
    },
  )
}

// ---------------------------------------------------------------------------
// RH — participantes de un proyecto (RH-02.1; PRD §20.3/§12; ET §31).
//
// GET /api/v1/rh/projects/{id}/participations → ParticipacionPageOut. Cada
// item incluye `empleado_nombre`/`empleado_puesto` (identificación de
// presentación provista por el backend): la vista JAMÁS consulta el empleado
// por su cuenta ni muestra el ID técnico como identificación principal.
// El listado es de solo lectura; la CORRECCIÓN administrativa de una
// participación (RH-02.2) tiene su propia función al final del archivo.
// ---------------------------------------------------------------------------

/** Tope de `por_pagina` del contrato de participaciones (evita un 422). */
export const POR_PAGINA_MAXIMO_RH = 100

/** Default de paginación del backend. */
export const POR_PAGINA_DEFECTO_RH = 20

/**
 * Lista las participaciones de un proyecto, paginado.
 *
 * El orden es el del backend (cronológico de registro, NO un ranking de
 * participantes); la respuesta llega sin transformar.
 *
 * @param {string} token token de la sesión RH.
 * @param {number|string} proyectoId identificador del proyecto.
 * @param {{pagina?: number, porPagina?: number}} [paginacion]
 * @returns {Promise<{total: number, pagina: number, por_pagina: number,
 *                    items: object[]}>} ParticipacionPageOut sin transformar.
 */
export async function listarParticipacionesDeProyecto(
  token,
  proyectoId,
  { pagina, porPagina } = {},
) {
  const consulta = new URLSearchParams()
  const paginaActual = Number.isFinite(pagina) ? Math.max(1, Math.trunc(pagina)) : 1
  const porPaginaActual = Number.isFinite(porPagina)
    ? Math.min(POR_PAGINA_MAXIMO_RH, Math.max(1, Math.trunc(porPagina)))
    : POR_PAGINA_DEFECTO_RH
  consulta.set('pagina', String(paginaActual))
  consulta.set('por_pagina', String(porPaginaActual))
  return solicitar(
    `/api/v1/rh/projects/${encodeURIComponent(proyectoId)}/participations?${consulta.toString()}`,
    { token },
  )
}

// ---------------------------------------------------------------------------
// RH — corrección administrativa de una participación (RH-02.2; PRD §12.2;
// Especificación §9.1/§25 — PATCH /api/v1/rh/participations/{id}).
//
// El cuerpo (`ParticipacionRhUpdateIn`, `extra="forbid"`) admite
// EXCLUSIVAMENTE `rol`, `entregables`, `en_equipo`, `coordino_tareas`,
// `explico_a_publico_distinto`, `resolvio_problema`, `horas` y el `motivo`
// opcional de la auditoría (≤ 512). JAMÁS se envían `empleado_id`,
// `proyecto_id` ni `fecha_registro`: no son corrección, romperían la
// identidad del registro, y el backend los rechaza con 422. La autorización
// (`require_rh`) es del backend en cada petición; aquí no se decide nada.
//
// Cada PATCH queda auditado por el backend (AuditoriaModificacion: quién,
// qué participación, cuándo, operación y valores anteriores/nuevos) dentro
// de la misma transacción — aquí no existe ningún segundo mecanismo.
// ---------------------------------------------------------------------------

/**
 * Corrección administrativa (RH) de una participación existente.
 *
 * @param {string} token token de la sesión RH.
 * @param {number|string} participacionId id de la participación a corregir.
 * @param {{rol?: string, entregables?: string|null, en_equipo?: boolean,
 *          coordino_tareas?: boolean, explico_a_publico_distinto?: boolean,
 *          resolvio_problema?: boolean, horas?: number, motivo?: string}} cambios
 *        campos corregidos, tal cual; sin transformar.
 * @returns {Promise<object>} ParticipacionOut corregida, sin transformar.
 */
export async function corregirParticipacion(token, participacionId, cambios) {
  return solicitar(
    `/api/v1/rh/participations/${encodeURIComponent(participacionId)}`,
    {
      metodo: 'PATCH',
      token,
      cuerpo: cambios,
    },
  )
}
