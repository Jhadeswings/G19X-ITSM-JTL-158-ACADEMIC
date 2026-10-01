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
