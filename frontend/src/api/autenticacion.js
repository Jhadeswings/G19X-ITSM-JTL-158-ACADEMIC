// Autenticación del frontend (PRD §3; Especificación Técnica §31/§32).
//
// Contratos EXISTENTES del backend (Fase 3), sin cambios:
// - POST /api/v1/auth/login → { access_token, token_type, rol, must_change_password }
// - POST /api/v1/auth/password/change → { mensaje } (Bearer del propio usuario;
//   es el único endpoint disponible mientras must_change_password = true)
//
// El estado de sesión guarda token + rol + must_change_password SOLO para
// decidir qué pantalla mostrar. NO es una fuente de autorización: el backend
// valida identidad y permisos en cada petición (ET §31) y el frontend nunca
// decide acceso. Nunca se guarda la contraseña ni ningún hash.

import { solicitar } from './clienteApi.js'

const CLAVE_SESION = 'talento.sesion'
// Clave de la versión anterior del frontend (solo el token). Se descarta al
// leer/guardar: sin rol ni must_change_password no se puede enrutar bien.
const CLAVE_ANTIGUA = 'talento.token'

function almacen() {
  try {
    return localStorage
  } catch {
    return null
  }
}

/** Sesión activa `{ token, rol, mustChangePassword }`, o `null` si no hay. */
export function obtenerSesion() {
  const guardado = almacen()
  if (!guardado) return null
  try {
    guardado.removeItem(CLAVE_ANTIGUA)
    const crudo = guardado.getItem(CLAVE_SESION)
    if (!crudo) return null
    const datos = JSON.parse(crudo)
    if (!datos?.token || !datos?.rol) return null
    return {
      token: datos.token,
      rol: datos.rol,
      mustChangePassword: datos.mustChangePassword === true,
    }
  } catch {
    return null
  }
}

/** Guarda la sesión. Si no hay almacenamiento, vive solo en memoria. */
export function guardarSesion(sesion) {
  const guardado = almacen()
  if (!guardado) return
  try {
    guardado.setItem(
      CLAVE_SESION,
      JSON.stringify({
        token: sesion.token,
        rol: sesion.rol,
        mustChangePassword: sesion.mustChangePassword === true,
      }),
    )
    guardado.removeItem(CLAVE_ANTIGUA)
  } catch {
    /* sin almacenamiento disponible: la sesión sigue en memoria */
  }
}

/** Aplica cambios a la sesión activa, la persiste y la devuelve. */
export function actualizarSesion(cambios) {
  const actual = obtenerSesion()
  if (!actual) return null
  const sesion = { ...actual, ...cambios }
  guardarSesion(sesion)
  return sesion
}

/** Cierra la sesión local (el backend no emite "logout": el token expira). */
export function limpiarSesion() {
  const guardado = almacen()
  if (!guardado) return
  try {
    guardado.removeItem(CLAVE_SESION)
    guardado.removeItem(CLAVE_ANTIGUA)
  } catch {
    /* nada que limpiar */
  }
}

/**
 * Renueva el access token de una sesión todavía válida (Bloque F: sesión por
 * inactividad).
 *
 * NO es un refresh token: no hay segundo token ni estado en el backend. El
 * endpoint reemite el mismo JWT de acceso. Solo funciona con un token vigente:
 * si expiró o la cuenta se desactivó, el backend responde 401 y esta función
 * lo propulsa tal cual, para que la vista cierre la sesión y NO intente
 * revivirla.
 *
 * Es TRANSPORTE PURO: no guarda nada, no decide nada y no reintenta.
 *
 * @param {string} token token de la sesión actual.
 * @returns {Promise<{token: string, rol: string, mustChangePassword: boolean}>}
 *   Misma forma que devuelve `iniciarSesion`, porque el contrato es el mismo.
 */
export async function renovarSesion(token) {
  const datos = await solicitar('/api/v1/auth/renew', {
    metodo: 'POST',
    token,
  })
  return {
    token: datos.access_token,
    rol: datos.rol,
    mustChangePassword: datos.must_change_password === true,
  }
}

/**
 * Inicia sesión y devuelve la sesión que describe el backend.
 * @returns {Promise<{token: string, rol: string, mustChangePassword: boolean}>}
 */
export async function iniciarSesion(email, password) {
  const datos = await solicitar('/api/v1/auth/login', {
    metodo: 'POST',
    cuerpo: { email, password },
  })
  return {
    token: datos.access_token,
    rol: datos.rol,
    mustChangePassword: datos.must_change_password === true,
  }
}

/**
 * Cambio de contraseña con el endpoint existente.
 * En el primer acceso (credencial temporal, PRD §3.3) el backend NO exige la
 * contraseña actual: la identidad ya se estableció en el login.
 * @returns {Promise<{mensaje: string}>}
 */
export async function cambiarPassword(token, passwordNueva) {
  return solicitar('/api/v1/auth/password/change', {
    metodo: 'POST',
    token,
    cuerpo: { password_nueva: passwordNueva },
  })
}

/**
 * Cambio VOLUNTARIO de contraseña: el usuario ya tiene contraseña definitiva
 * (`must_change_password=false`, PRD §3.3) y por eso el backend EXIGE además
 * `password_actual` (ver `auth_service.cambiar_password`, que responde 400 si
 * falta o no coincide). Por eso es una función SEPARADA y no una opción de
 * `cambiarPassword`: el flujo de primer acceso ya está cerrado y probado, y su
 * semántica (enviar únicamente `password_nueva`) no debe cambiar.
 *
 * Es TRANSPORTE PURO: no valida reglas de contraseña, no calcula, no consulta
 * `/me`, no toca la sesión ni `mustChangePassword` e no interpreta la
 * respuesta. La política de contraseña la aplica el esquema del backend
 * (PRD §3.5, 422) y la coincidencia de contraseñas será responsabilidad del
 * formulario que la use. La identidad la deriva el backend del token (ET
 * §31/§32): aquí no se envía ningún identificador de cuenta.
 * @returns {Promise<{mensaje: string}>}
 */
export async function cambiarPasswordConActual(
  token,
  passwordActual,
  passwordNueva,
) {
  return solicitar('/api/v1/auth/password/change', {
    metodo: 'POST',
    token,
    cuerpo: {
      password_actual: passwordActual,
      password_nueva: passwordNueva,
    },
  })
}
