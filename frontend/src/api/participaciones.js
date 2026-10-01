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
// La consulta (GET) y la edición (PATCH) de participaciones NO forman parte de
// este microbloque: solo se implementa el registro inicial.

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
