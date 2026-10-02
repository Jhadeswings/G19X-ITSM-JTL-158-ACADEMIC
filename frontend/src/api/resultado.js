// Resultado actual propio del Empleado (ET §31 `GET /me/result`, MB-7-1).
//
// Contrato de solo lectura: devuelve el `ResultadoActualDTO` OFICIAL tal cual
// lo calcula el `CompetencyEngine` del backend:
// - `competencias`: las CINCO exactas con `nivel`, `etiqueta`, estado
//   `CALCULABLE | INSUFFICIENT_DATA` y su evidencia;
// - `experiencia`: información CONTEXTUAL (no es una sexta competencia);
// - `fortalezas` / `oportunidades`: claves ya decididas por reglas del backend.
//
// El endpoint NO acepta `empleado_id`: la identidad la deriva siempre del
// token (ET §32, anti-IDOR). Aquí no se envía ningún identificador.
//
// Este módulo solo transporta: no transforma, no calcula, no redondea y no
// completa datos. En particular NO convierte `INSUFFICIENT_DATA` en cero ni
// recalcula niveles (Style Guide §3.6, §15.3).

import { solicitar } from './clienteApi.js'

/**
 * Obtiene el resultado actual oficial del Empleado autenticado.
 * @param {string} token token de la sesión Empleado.
 * @returns {Promise<object>} ResultadoActualDTO del backend, sin transformar.
 */
export async function obtenerResultadoActual(token) {
  return solicitar('/api/v1/me/result', { token })
}