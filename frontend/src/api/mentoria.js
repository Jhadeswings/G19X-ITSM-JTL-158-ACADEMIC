// Mentoría por RH (PRD §14; ET §29).
//
// POST /api/v1/rh/mentorship/suggest con EXACTAMENTE { receiver_id,
// competency_code }: el backend calcula todo por reglas (nivel del receptor,
// elegibilidad, mentor y Criterio del sistema). Aquí no se interpreta ni se
// recalcula nada: la respuesta se presenta tal cual llega.

import { solicitar } from './clienteApi.js'

/**
 * Sugiere un mentor para un receptor en una competencia.
 * @param {string} token token de la sesión RH.
 * @param {{receiver_id: number, competency_code: string}} datos receptor y
 *   competencia objetivo (única entrada que acepta el contrato).
 * @returns {Promise<object>} SugerenciaMentoriaOut del backend, sin transformar.
 */
export async function sugerirMentor(token, datos) {
  return solicitar('/api/v1/rh/mentorship/suggest', {
    metodo: 'POST',
    token,
    cuerpo: datos,
  })
}