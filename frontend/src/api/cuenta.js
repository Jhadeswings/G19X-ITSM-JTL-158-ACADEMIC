// Cuenta autenticada (GET /api/v1/me, Fase 3): endpoint EXISTENTE del backend
// que devuelve la identidad de la propia cuenta (email, rol, empleado_id,
// empleado_nombre, must_change_password).
//
// Solo alimenta la presentación de la cuenta en el header (Style Guide §11).
// No decide permisos: la autorización la aplica el backend en cada petición
// (ET §31/§32).

import { solicitar } from './clienteApi.js'

export async function obtenerCuenta(token) {
  return solicitar('/api/v1/me', { token })
}
