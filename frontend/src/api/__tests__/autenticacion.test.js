// Estado de sesión y contratos de autenticación usados por el frontend
// (PRD §3.1/§3.3; Especificación Técnica §31). El cliente HTTP se mockea:
// sin llamadas reales al backend.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { solicitar } from '../clienteApi.js'
import {
  actualizarSesion,
  cambiarPassword,
  guardarSesion,
  iniciarSesion,
  limpiarSesion,
  obtenerSesion,
} from '../autenticacion.js'

vi.mock('../clienteApi.js', () => ({ solicitar: vi.fn() }))

beforeEach(() => {
  vi.mocked(solicitar).mockReset()
  localStorage.clear()
})

describe('autenticacion — inicio de sesión', () => {
  it('conserva token, rol y must_change_password que devuelve el backend', async () => {
    vi.mocked(solicitar).mockResolvedValue({
      access_token: 'token-1',
      token_type: 'bearer',
      rol: 'EMPLEADO',
      must_change_password: true,
    })

    const sesion = await iniciarSesion('persona@empresa.dev', 'temporal1')

    expect(sesion).toEqual({
      token: 'token-1',
      rol: 'EMPLEADO',
      mustChangePassword: true,
    })
    expect(solicitar).toHaveBeenCalledWith('/api/v1/auth/login', {
      metodo: 'POST',
      cuerpo: { email: 'persona@empresa.dev', password: 'temporal1' },
    })
  })

  it('marca mustChangePassword=false en una cuenta con contraseña definitiva', async () => {
    vi.mocked(solicitar).mockResolvedValue({
      access_token: 'token-2',
      token_type: 'bearer',
      rol: 'RH',
      must_change_password: false,
    })

    const sesion = await iniciarSesion('rh@empresa.dev', 'secreta123')

    expect(sesion.rol).toBe('RH')
    expect(sesion.mustChangePassword).toBe(false)
  })
})

describe('autenticacion — sesión local', () => {
  it('guarda y recupera la sesión completa', () => {
    guardarSesion({ token: 't', rol: 'EMPLEADO', mustChangePassword: true })

    expect(obtenerSesion()).toEqual({
      token: 't',
      rol: 'EMPLEADO',
      mustChangePassword: true,
    })
  })

  it('no guarda la contraseña en el estado de sesión', async () => {
    vi.mocked(solicitar).mockResolvedValue({
      access_token: 't',
      token_type: 'bearer',
      rol: 'EMPLEADO',
      must_change_password: true,
    })

    guardarSesion(await iniciarSesion('persona@empresa.dev', 'temporal1'))

    expect(localStorage.getItem('talento.sesion')).not.toContain('temporal1')
    expect(JSON.stringify(obtenerSesion())).not.toContain('temporal1')
  })

  it('devuelve null si no hay sesión guardada', () => {
    expect(obtenerSesion()).toBeNull()
  })

  it('devuelve null si el contenido guardado está corrupto', () => {
    localStorage.setItem('talento.sesion', 'no-es-json')
    expect(obtenerSesion()).toBeNull()
  })

  it('devuelve null si falta el rol (almacenamiento incompleto)', () => {
    localStorage.setItem('talento.sesion', JSON.stringify({ token: 't' }))
    expect(obtenerSesion()).toBeNull()
  })

  it('descarta la clave antigua (solo token) al leer', () => {
    localStorage.setItem('talento.token', 'token-de-la-version-anterior')

    expect(obtenerSesion()).toBeNull()
    expect(localStorage.getItem('talento.token')).toBeNull()
  })

  it('actualizarSesion conserva el token y baja mustChangePassword', () => {
    guardarSesion({ token: 't', rol: 'EMPLEADO', mustChangePassword: true })

    const sesion = actualizarSesion({ mustChangePassword: false })

    expect(sesion).toEqual({
      token: 't',
      rol: 'EMPLEADO',
      mustChangePassword: false,
    })
    expect(obtenerSesion()).toEqual(sesion)
  })

  it('limpiarSesion borra la sesión guardada', () => {
    guardarSesion({ token: 't', rol: 'EMPLEADO', mustChangePassword: false })

    limpiarSesion()

    expect(obtenerSesion()).toBeNull()
  })
})

describe('autenticacion — cambio de contraseña', () => {
  it('usa el endpoint existente con el token de la propia sesión', async () => {
    vi.mocked(solicitar).mockResolvedValue({ mensaje: 'Contraseña actualizada.' })

    await cambiarPassword('token-1', 'nueva123')

    expect(solicitar).toHaveBeenCalledWith('/api/v1/auth/password/change', {
      metodo: 'POST',
      token: 'token-1',
      cuerpo: { password_nueva: 'nueva123' },
    })
  })
})
