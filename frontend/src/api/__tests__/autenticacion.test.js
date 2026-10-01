// Estado de sesión y contratos de autenticación usados por el frontend
// (PRD §3.1/§3.3; Especificación Técnica §31). El cliente HTTP se mockea:
// sin llamadas reales al backend.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { solicitar } from '../clienteApi.js'
import {
  actualizarSesion,
  cambiarPassword,
  cambiarPasswordConActual,
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

// ---------------------------------------------------------------------------
// MB-6-2 — Cambio VOLUNTARIO de contraseña ("Mi cuenta", PRD §3.3).
//
// Con `must_change_password=false` el backend EXIGE `password_actual`
// (`auth_service.cambiar_password`, 400 si falta o no coincide). Estos tests
// fijan el TRANSPORTE de ese caso. El flujo de primer acceso, ya cerrado, se
// comprueba aparte al final: sigue enviando únicamente `password_nueva`.
// ---------------------------------------------------------------------------
describe('autenticacion — cambio voluntario de contraseña', () => {
  const RESPUESTA = { mensaje: 'Contraseña actualizada.' }

  beforeEach(() => {
    vi.mocked(solicitar).mockResolvedValue(RESPUESTA)
  })

  it('envía el método POST en la ruta exacta del endpoint existente', async () => {
    await cambiarPasswordConActual('token-1', 'actual123', 'nueva1234')

    expect(solicitar).toHaveBeenCalledTimes(1)
    const [ruta, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(ruta).toBe('/api/v1/auth/password/change')
    expect(opciones.metodo).toBe('POST')
  })

  it('envía el token de la sesión en la cabecera Authorization', async () => {
    // `solicitar` es el cliente HTTP compartido: el token viaja siempre ahí y
    // el backend deriva la identidad de él (ET §31/§32).
    await cambiarPasswordConActual('token-1', 'actual123', 'nueva1234')

    expect(vi.mocked(solicitar).mock.calls[0][1].token).toBe('token-1')
  })

  it('envía el body exacto con password_actual y password_nueva', async () => {
    await cambiarPasswordConActual('token-1', 'actual123', 'nueva1234')

    expect(vi.mocked(solicitar).mock.calls[0][1].cuerpo).toEqual({
      password_actual: 'actual123',
      password_nueva: 'nueva1234',
    })
  })

  it('no envía ningún identificador de cuenta ni de empleado (§32)', async () => {
    await cambiarPasswordConActual('token-1', 'actual123', 'nueva1234')

    const cuerpo = vi.mocked(solicitar).mock.calls[0][1].cuerpo
    expect(Object.keys(cuerpo).sort()).toEqual([
      'password_actual',
      'password_nueva',
    ])
    expect(cuerpo).not.toHaveProperty('cuenta_id')
    expect(cuerpo).not.toHaveProperty('empleado_id')
  })

  it('no valida ni corrige la contraseña: envía la cadena tal cual', async () => {
    // La política (PRD §3.5) la aplica el esquema del backend con 422. Aquí no
    // hay reglas de negocio: el transporte no juzga la contraseña.
    await cambiarPasswordConActual('token-1', 'corta', 'a')

    expect(vi.mocked(solicitar).mock.calls[0][1].cuerpo).toEqual({
      password_actual: 'corta',
      password_nueva: 'a',
    })
  })

  it('devuelve la respuesta del backend sin transformarla', async () => {
    await expect(
      cambiarPasswordConActual('token-1', 'actual123', 'nueva1234'),
    ).resolves.toBe(RESPUESTA)
  })

  it('propaga el 400 del backend cuando la contraseña actual no coincide', async () => {
    const error = Object.assign(new Error('La contraseña actual es incorrecta.'), {
      estado: 400,
    })
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(
      cambiarPasswordConActual('token-1', 'equivocada9', 'nueva1234'),
    ).rejects.toBe(error)
  })

  it('propaga el 422 de política para que el formulario lo muestre legible', async () => {
    const error = Object.assign(new Error('Some data is invalid'), {
      estado: 422,
    })
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(
      cambiarPasswordConActual('token-1', 'actual123', 'corta'),
    ).rejects.toBe(error)
  })

  it('propaga el 401 para que la sesión se cierre (ET §31)', async () => {
    const error = Object.assign(new Error('Credenciales inválidas.'), {
      estado: 401,
    })
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(
      cambiarPasswordConActual('token-1', 'actual123', 'nueva1234'),
    ).rejects.toBe(error)
  })

  it('NO modifica la sesión ni mustChangePassword (transporte puro)', async () => {
    guardarSesion({
      token: 'token-1',
      rol: 'EMPLEADO',
      mustChangePassword: false,
    })

    await cambiarPasswordConActual('token-1', 'actual123', 'nueva1234')

    expect(obtenerSesion()).toEqual({
      token: 'token-1',
      rol: 'EMPLEADO',
      mustChangePassword: false,
    })
  })
})

describe('autenticacion — el primer acceso no se ve afectado', () => {
  it('cambiarPassword sigue enviando ÚNICAMENTE password_nueva', async () => {
    // Con credencial temporal el backend NO exige la contraseña actual
    // (PRD §3.3). Este flujo ya estaba cerrado y probado: no debe cambiar.
    vi.mocked(solicitar).mockResolvedValue({
      mensaje: 'Contraseña actualizada.',
    })

    await cambiarPassword('token-temporal', 'nueva123')

    const [, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(opciones.cuerpo).toEqual({ password_nueva: 'nueva123' })
    expect(opciones.cuerpo).not.toHaveProperty('password_actual')
  })

  it('las dos funciones comparten endpoint pero no semántica', async () => {
    vi.mocked(solicitar).mockResolvedValue({
      mensaje: 'Contraseña actualizada.',
    })

    await cambiarPassword('token-temporal', 'nueva123')
    await cambiarPasswordConActual('token-1', 'actual123', 'nueva1234')

    const [primera, segunda] = vi.mocked(solicitar).mock.calls
    expect(primera[0]).toBe(segunda[0])
    expect(primera[1].cuerpo).not.toEqual(segunda[1].cuerpo)
  })
})
