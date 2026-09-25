// Consumo del endpoint de "Mi progreso" (Fase 12).
//
// GET /api/v1/me/progress/recommendation devuelve TODO lo que la vista
// necesita en un solo objeto ya calculado por el backend:
// - `resultado_actual`: cinco competencias (nivel/etiqueta/DI),
//   experiencia como contexto, fortalezas y oportunidades por reglas;
// - `recomendacion_ia`: sugerencia de desarrollo (bloque separado), o
//   `null` cuando la IA no está disponible: es un estado controlado del
//   backend, NO un error de la vista (el resultado oficial se muestra
//   igualmente).
//
// El frontend NO calcula niveles, fortalezas ni oportunidades: solo
// presenta lo que el backend envía (PRD §17.4, Style Guide §3.6).

import { solicitar } from './clienteApi.js'

export async function obtenerProgreso(token) {
  return solicitar('/api/v1/me/progress/recommendation', { token })
}
