// Alta de empleado por RH (PRD §3.3; Especificación Técnica §31).
//
// POST /api/v1/rh/employees crea Empleado + CuentaAcceso con credencial
// temporal en el backend: la credencial NUNCA viaja en la respuesta ni se
// solicita por otro endpoint (DECISIONES_TECNICAS.md §14). El frontend solo
// envía los datos que registra RH.
//
// Autorización: el token de la sesión RH viaja en la cabecera Authorization
// y el backend aplica require_rh en cada petición (ET §31/§32). Aquí no se
// decide ningún permiso.

import { solicitar } from './clienteApi.js'

/**
 * Crea un empleado con su cuenta de acceso.
 * @param {string} token token de la sesión RH.
 * @param {{nombre: string, email: string, puesto?: string|null,
 *          area?: string|null, fecha_ingreso?: string|null}} datos
 * @returns {Promise<object>} EmpleadoOut del backend (sin credenciales).
 */
export async function crearEmpleado(token, datos) {
  return solicitar('/api/v1/rh/employees', {
    metodo: 'POST',
    token,
    cuerpo: datos,
  })
}