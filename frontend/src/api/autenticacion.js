// Autenticación mínima del frontend.
//
// POST /api/v1/auth/login con {email, password} (contrato existente del
// backend, Fase 3). El token de acceso se guarda localmente solo para
// enviarlo en la cabecera Authorization: el backend valida identidad y
// permisos en cada petición (ET §31); el frontend nunca decide acceso.

import { solicitar } from './clienteApi.js'

const CLAVE_TOKEN = 'talento.token'

export function obtenerToken() {
  try {
    return localStorage.getItem(CLAVE_TOKEN)
  } catch {
    return null
  }
}

export function guardarToken(token) {
  try {
    localStorage.setItem(CLAVE_TOKEN, token)
  } catch {
    /* sin almacenamiento disponible: la vista seguirá funcionando en
       esta sesión con el token en memoria */
  }
}

export function limpiarToken() {
  try {
    localStorage.removeItem(CLAVE_TOKEN)
  } catch {
    /* nada que limpiar */
  }
}

/** Inicia sesión y devuelve el access_token del backend. */
export async function iniciarSesion(email, password) {
  const datos = await solicitar('/api/v1/auth/login', {
    metodo: 'POST',
    cuerpo: { email, password },
  })
  return datos.access_token
}
