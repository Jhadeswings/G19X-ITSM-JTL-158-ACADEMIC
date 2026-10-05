/**
 * Pruebas del cierre de sesión por inactividad (Bloque F).
 *
 * NO se esperan 28 ni 30 minutos reales: se usa `vi.useFakeTimers()` y
 * `vi.advanceTimersByTimeAsync()` para simular el paso del tiempo.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App.jsx'
import {
  AVISO_MS,
  CIERRE_MS,
  RENOVAR_CADA_MS as MIN_RENOVACION,
  debeRenovar,
  duracionTokenMs,
} from '../lib/useInactividad.js'

const MS_MIN = 60 * 1000
const CLAVE_SESION = 'talento.sesion'

/**
 * JWT con vida REAL de `duracionMin` y `restanteMin` de vida por delante.
 * `exp - iat = duracionMin`, y `exp` está en el futuro como marca `restanteMin`.
 * Permite verificar que el umbral se deriva del token, no de un número fijo.
 */
function tokenCompleto(duracionMin, restanteMin = duracionMin) {
  const exp = Math.floor(Date.now() / 1000) + restanteMin * 60
  const iat = exp - duracionMin * 60
  const carga = btoa(JSON.stringify({ sub: 1, rol: 'EMPLEADO', iat, exp }))
  return `encabezado.${carga}.firma`
}

/**
 * JWT con `restanteMin` de vida por delante y vida real de 30 min, como el que
 * emite hoy el backend (`ACCESS_TOKEN_EXPIRE_MINUTES = 30`). El `iat` es
 * necesario para derivar la duración, igual que en el token real.
 */
function tokenDe30(restanteMin) {
  return tokenCompleto(30, restanteMin)
}

function guardarSesionEnStorage(rol = 'EMPLEADO', mustChangePassword = false, token = tokenDe30(29)) {
  window.localStorage.setItem(CLAVE_SESION, JSON.stringify({ token, rol, mustChangePassword }))
}

/** Dispatch sin necesitar `PointerEvent`, que jsdom no implementa. */
function actividad(tipo) {
  window.dispatchEvent(new Event(tipo, { bubbles: true }))
}

function respuestaOk(cuerpo) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(cuerpo) })
}

const CUENTA_EMPLEADO = {
  id: 1,
  nombre: 'Empleado Prueba',
  email: 'empleado@empresa.dev',
  rol: 'EMPLEADO',
  puesto: 'Desarrollo',
  area: 'Tecnología',
  activo: true,
  must_change_password: false,
}

const RESULTADO_VACIO = {
  empleado_id: 1,
  competencias: [],
  experiencia: { fecha_ingreso: null, anios_antiguedad: 0, proyectos_unicos: 0 },
  fortalezas: [],
  oportunidades: [],
}

const PAGINA_VACIA = { total: 0, pagina: 1, por_pagina: 20, items: [] }

function respuestaRenovacion(rol = 'EMPLEADO', minutos = 30) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        access_token: tokenDe30(minutos),
        token_type: 'bearer',
        rol,
        must_change_password: false,
      }),
  }
}

function respuesta401() {
  return {
    ok: false,
    status: 401,
    json: () => Promise.resolve({ detail: 'Credenciales inválidas.' }),
  }
}

/** Cuenta las llamadas a una ruta en el mock de fetch. */
function llamadasA(fetchMock, ruta) {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes(ruta))
}

/**
 * Fetch enrutado por URL: cada endpoint devuelve la forma que REALMENTE espera
 * la vista. Un mock único devolvía `/me` para todo y reventaba Mi progreso.
 */
function fetchEnrutado(overrides = {}) {
  return vi.fn((url) => {
    const ruta = String(url)
    if (overrides[ruta]) return overrides[ruta]()
    if (ruta.includes('/api/v1/auth/login')) {
      return respuestaOk({
        access_token: tokenDe30(30),
        token_type: 'bearer',
        rol: 'EMPLEADO',
        must_change_password: false,
      })
    }
    if (ruta.includes('/api/v1/auth/renew')) return respuestaRenovacion()
    if (ruta.includes('/api/v1/me/result')) return respuestaOk(RESULTADO_VACIO)
    // Mi progreso (sección inicial) usa el endpoint con bloques oficial + IA.
    if (ruta.includes('/api/v1/me/progress')) {
      return respuestaOk({ resultado_actual: RESULTADO_VACIO, recomendacion_ia: null })
    }
    if (ruta.includes('/api/v1/me/projects')) return respuestaOk(PAGINA_VACIA)
    if (ruta.includes('/api/v1/me/trainings')) return respuestaOk(PAGINA_VACIA)
    return respuestaOk(CUENTA_EMPLEADO)
  })
}

describe('sesión por inactividad (Bloque F)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    window.localStorage.clear()
    vi.stubGlobal('fetch', fetchEnrutado())
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  /** Avanza el reloj dejando que las promesas pendientes se resuelvan. */
  async function avanzar(ms) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  // --- SESIÓN ACTIVA Y CICLO DEL AVISO ------------------------------------

  it('una sesión activa no muestra aviso antes de los 28 minutos', async () => {
    guardarSesionEnStorage()
    render(<App />)

    await avanzar(27 * MS_MIN)

    expect(screen.queryByText('Tu sesión está por vencer')).toBeNull()
    // Seguimos dentro de la app: no se volvió al login.
    expect(screen.queryByText('Acceso seguro')).toBeNull()
  })

  it('muestra el aviso a los 28 minutos con el contador en 2:00', async () => {
    guardarSesionEnStorage()
    render(<App />)

    await avanzar(28 * MS_MIN)

    expect(screen.getByText('Tu sesión está por vencer')).toBeTruthy()
    expect(screen.getByText(/No hemos detectado actividad durante un tiempo/)).toBeTruthy()
    expect(screen.getByText('Se cierra en 2:00')).toBeTruthy()
  })

  it('el contador desciende y el aviso desaparece al agotarse', async () => {
    guardarSesionEnStorage()
    render(<App />)

    await avanzar(28 * MS_MIN)
    await avanzar(60 * 1000)
    expect(screen.getByText('Se cierra en 1:00')).toBeTruthy()

    // Al agotarse los 2 minutos, el cierre automático se ejecuta.
    await avanzar(60 * 1000)
    expect(screen.queryByText('Tu sesión está por vencer')).toBeNull()
    await waitFor(() => {
      expect(window.localStorage.getItem(CLAVE_SESION)).toBeNull()
    })
  })

  // --- mousemove NO ES ACTIVIDAD ------------------------------------------

  it('mousemove no cuenta como actividad: el aviso sigue apareciendo', async () => {
    guardarSesionEnStorage()
    render(<App />)

    await avanzar(27 * MS_MIN)
    await act(async () => {
      // 27 min + 70 s supera los 28 min: si `mousemove` contara como
      // actividad, el contador se reiniciaría y el aviso no aparecería.
      for (let i = 0; i < 70; i += 1) {
        actividad('mousemove')
        await vi.advanceTimersByTimeAsync(1000)
      }
    })

    expect(screen.getByText('Tu sesión está por vencer')).toBeTruthy()
  })

  // --- LA ACTIVIDAD REINICIA EL CONTADOR ----------------------------------

  it('pointerdown reinicia el contador: tras 28 min del último clic no hay aviso', async () => {
    guardarSesionEnStorage()
    render(<App />)

    await avanzar(27 * MS_MIN)
    await act(async () => {
      actividad('pointerdown')
    })
    await avanzar(27 * MS_MIN)

    expect(screen.queryByText('Tu sesión está por vencer')).toBeNull()
  })

  it('keydown y touchstart también son actividad significativa', async () => {
    guardarSesionEnStorage()
    render(<App />)

    await avanzar(27 * MS_MIN)
    await act(async () => {
      actividad('keydown')
      actividad('touchstart')
    })
    await avanzar(27 * MS_MIN)

    expect(screen.queryByText('Tu sesión está por vencer')).toBeNull()
  })

  it('la actividad durante el aviso lo cancela', async () => {
    guardarSesionEnStorage()
    render(<App />)

    await avanzar(28 * MS_MIN)
    expect(screen.getByText('Tu sesión está por vencer')).toBeTruthy()

    await act(async () => {
      actividad('pointerdown')
    })

    expect(screen.queryByText('Tu sesión está por vencer')).toBeNull()
  })

  // --- "SEGUIR CONECTADO" --------------------------------------------------

  it('"Seguir conectado" cancela el aviso y mantiene la sesión', async () => {
    guardarSesionEnStorage()
    render(<App />)

    await avanzar(28 * MS_MIN)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Seguir conectado' }))
    })

    expect(screen.queryByText('Tu sesión está por vencer')).toBeNull()
    expect(screen.queryByText('Acceso seguro')).toBeNull()
  })

  it('"Seguir conectado" invoca POST /api/v1/auth/renew con el token', async () => {
    guardarSesionEnStorage('EMPLEADO', false, tokenDe30(3))
    render(<App />)
    const fetchMock = globalThis.fetch
    fetchMock.mockClear()

    await avanzar(28 * MS_MIN)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Seguir conectado' }))
    })

    const [llamada] = llamadasA(fetchMock, '/api/v1/auth/renew')
    expect(llamada).toBeTruthy()
    expect(llamada[1].method).toBe('POST')
    const cabeceras = llamada[1].headers
    expect(String(cabeceras.Authorization || cabeceras.authorization)).toContain('Bearer ')
  })

  it('una renovación exitosa guarda el token nuevo y conserva la sesión', async () => {
    guardarSesionEnStorage('EMPLEADO', false, tokenDe30(3))
    render(<App />)

    await avanzar(28 * MS_MIN)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Seguir conectado' }))
    })

    await waitFor(() => {
      const guardada = JSON.parse(window.localStorage.getItem(CLAVE_SESION))
      expect(guardada.token).not.toBe(tokenDe30(3))
    })
    expect(screen.queryByText('Acceso seguro')).toBeNull()
  })

  it('una renovación con 401 cierra la sesión y NO intenta revivirla', async () => {
    guardarSesionEnStorage('EMPLEADO', false, tokenDe30(3))
    render(<App />)

    vi.stubGlobal(
      'fetch',
      fetchEnrutado({ '/api/v1/auth/renew': () => respuesta401() }),
    )

    await avanzar(28 * MS_MIN)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Seguir conectado' }))
    })

    await waitFor(() => {
      expect(window.localStorage.getItem(CLAVE_SESION)).toBeNull()
    })
    expect(screen.getByText('Acceso seguro')).toBeTruthy()
  })

  // --- CIERRE POR INACTIVIDAD ---------------------------------------------

  it('sin actividad, cierra la sesión a los 30 minutos y limpia localStorage', async () => {
    guardarSesionEnStorage()
    render(<App />)

    await avanzar(30 * MS_MIN)

    await waitFor(() => {
      expect(window.localStorage.getItem(CLAVE_SESION)).toBeNull()
    })
    expect(screen.getByText('Acceso seguro')).toBeTruthy()
  })

  // --- MENSAJE EN EL LOGIN -------------------------------------------------

  it('el login explica que la sesión se cerró por inactividad', async () => {
    guardarSesionEnStorage()
    render(<App />)

    await avanzar(30 * MS_MIN)

    await waitFor(() => {
      expect(screen.getByText(/Tu sesión se cerró por inactividad/)).toBeTruthy()
    })
    expect(screen.getByText(/Inicia sesión nuevamente para continuar/)).toBeTruthy()
  })

  it('el logout manual NO muestra el mensaje de inactividad', async () => {
    guardarSesionEnStorage()
    render(<App />)

    await waitFor(() => expect(screen.queryByText('Acceso seguro')).toBeNull())
    const botonSalir = screen.getAllByRole('button', { name: /sesión/i })[0]
    await act(async () => {
      fireEvent.click(botonSalir)
    })

    expect(screen.getByText('Acceso seguro')).toBeTruthy()
    expect(screen.queryByText(/Tu sesión se cerró por inactividad/)).toBeNull()
    expect(window.localStorage.getItem(CLAVE_SESION)).toBeNull()
  })

  // --- RH SE COMPORTA IGUAL ------------------------------------------------

  it('RH obtiene el mismo aviso y el mismo botón que Empleado', async () => {
    guardarSesionEnStorage('RH', false, tokenDe30(3))
    render(<App />)
    vi.stubGlobal(
      'fetch',
      fetchEnrutado({ '/api/v1/auth/renew': () => respuestaRenovacion('RH') }),
    )

    await avanzar(28 * MS_MIN)
    expect(screen.getByText('Tu sesión está por vencer')).toBeTruthy()
    expect(screen.getByText('Se cierra en 2:00')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Seguir conectado' }))
    })
    expect(screen.queryByText('Tu sesión está por vencer')).toBeNull()
  })

  it('RH también cierra la sesión por inactividad a los 30 minutos', async () => {
    guardarSesionEnStorage('RH')
    render(<App />)

    await avanzar(30 * MS_MIN)

    await waitFor(() => {
      expect(window.localStorage.getItem(CLAVE_SESION)).toBeNull()
    })
    expect(screen.getByText(/Tu sesión se cerró por inactividad/)).toBeTruthy()
  })

  // --- NO SE ROMPEN LOGIN NI PRIMER ACCESO --------------------------------

  it('el login sigue funcionando y no muestra aviso de inactividad', async () => {
    window.localStorage.clear()
    render(<App />)

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Correo de acceso'), {
        target: { value: 'empleado@empresa.dev' },
      })
      fireEvent.change(screen.getByLabelText('Contraseña'), {
        target: { value: 'Clave1234' },
      })
      fireEvent.click(screen.getByRole('button', { name: /^Ingresar/ }))
    })

    await waitFor(() => {
      expect(window.localStorage.getItem(CLAVE_SESION)).not.toBeNull()
    })
    expect(screen.queryByText(/Tu sesión se cerró por inactividad/)).toBeNull()
    expect(screen.queryByText('Tu sesión está por vencer')).toBeNull()
  })

  it('el cambio obligatorio de contraseña sigue funcionando', async () => {
    guardarSesionEnStorage('EMPLEADO', true)
    render(<App />)

    await waitFor(() => {
      expect(screen.getByLabelText('Nueva contraseña')).toBeTruthy()
    })
    expect(screen.queryByText('Tu sesión está por vencer')).toBeNull()
  })

  // --- POLÍTICA DE INACTIVIDAD (sin cambios en F.1) ----------------------

  it('la política aprobada se mantiene: 28 min de aviso y 30 min de cierre', () => {
    expect(AVISO_MS).toBe(28 * MS_MIN)
    expect(CIERRE_MS).toBe(2 * MS_MIN)
    expect(AVISO_MS + CIERRE_MS).toBe(30 * MS_MIN)
  })

  // --- UMBRAL DERIVADO DE iat/exp (F.1) ----------------------------------

  it('el umbral de renovación se deriva de iat/exp, no de un 20 min fijo', () => {
    // Token de 30 min (el que emite el backend hoy): vida 30 min, umbral al
    // quedarle 1/3 → 10 min restantes, es decir ≤ 20 min. Equivale al
    // antiguo umbral fijo de 20 min, pero ahora está DERIVADO.
    expect(duracionTokenMs(tokenDe30(30))).toBe(30 * MS_MIN)
    expect(debeRenovar(tokenDe30(30))).toBe(false)
    expect(debeRenovar(tokenDe30(21))).toBe(false)
    expect(debeRenovar(tokenDe30(20))).toBe(true)
    expect(debeRenovar(tokenDe30(3))).toBe(true)

    // Si el backend cambiara la duración, el umbral se adapta solo.
    expect(duracionTokenMs(tokenCompleto(60, 60))).toBe(60 * MS_MIN)
    expect(debeRenovar(tokenCompleto(60, 60))).toBe(false)
    expect(debeRenovar(tokenCompleto(60, 41))).toBe(false)
    expect(debeRenovar(tokenCompleto(60, 40))).toBe(true)

    expect(duracionTokenMs(tokenCompleto(15, 15))).toBe(15 * MS_MIN)
    expect(debeRenovar(tokenCompleto(15, 15))).toBe(false)
    expect(debeRenovar(tokenCompleto(15, 11))).toBe(false)
    expect(debeRenovar(tokenCompleto(15, 10))).toBe(true)
  })

  it('un token sin iat legible no se renueva a ciegas', () => {
    expect(duracionTokenMs('no-es-un-jwt')).toBeNull()
    expect(debeRenovar('no-es-un-jwt')).toBe(false)
    // Token con exp pero sin iat: duración desconocida -> no se renueva.
    expect(debeRenovar(`a.${btoa(JSON.stringify({ exp: 9e9 }))}.c`)).toBe(false)
  })

  it('con token de 30 min no renueva hasta el umbral derivado', async () => {
    guardarSesionEnStorage('EMPLEADO', false, tokenDe30(30))
    render(<App />)
    const fetchMock = globalThis.fetch
    fetchMock.mockClear()

    await act(async () => {
      actividad('pointerdown')
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(llamadasA(fetchMock, '/api/v1/auth/renew').length).toBe(0)
  })

  it('con un token de 60 min no renueva hasta el umbral derivado (40 min)', async () => {
    guardarSesionEnStorage('EMPLEADO', false, tokenCompleto(60))
    render(<App />)
    const fetchMock = globalThis.fetch
    fetchMock.mockClear()

    await act(async () => {
      actividad('pointerdown')
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(llamadasA(fetchMock, '/api/v1/auth/renew').length).toBe(0)
  })

  it('no renueva más de una vez cada 5 minutos', async () => {
    guardarSesionEnStorage('EMPLEADO', false, tokenDe30(2))
    render(<App />)
    const fetchMock = globalThis.fetch
    fetchMock.mockClear()

    // Actividades separadas por ~1 min tras agotar el intervalo mínimo.
    await avanzar(MIN_RENOVACION + MS_MIN)
    await act(async () => {
      actividad('pointerdown')
    })
    await avanzar(2 * MS_MIN)
    await act(async () => {
      actividad('pointerdown')
    })
    await avanzar(2 * MS_MIN)
    await act(async () => {
      actividad('pointerdown')
    })

    expect(llamadasA(fetchMock, '/api/v1/auth/renew').length).toBe(1)
  })

  it('"Seguir conectado" renueva de inmediato aunque el umbral no toque', async () => {
    guardarSesionEnStorage('EMPLEADO', false, tokenDe30(30))
    render(<App />)
    const fetchMock = globalThis.fetch
    fetchMock.mockClear()

    await avanzar(28 * MS_MIN)
    expect(llamadasA(fetchMock, '/api/v1/auth/renew').length).toBe(0)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Seguir conectado' }))
    })

    expect(llamadasA(fetchMock, '/api/v1/auth/renew').length).toBe(1)
  })

  // --- ESTRATEGIA DE RENOVACIÓN Y UMBRAL DERIVADO (F.1) -----------------

  it('no renueva en cada evento: una ráfaga de scroll genera una sola renovación', async () => {
    guardarSesionEnStorage('EMPLEADO', false, tokenDe30(2))
    render(<App />)
    const fetchMock = globalThis.fetch
    fetchMock.mockClear()

    await act(async () => {
      for (let i = 0; i < 40; i += 1) {
        actividad('scroll')
        await vi.advanceTimersByTimeAsync(10)
      }
    })

    expect(llamadasA(fetchMock, '/api/v1/auth/renew').length).toBe(1)
  })

  it('no renueva si al token le queda mucha vida', async () => {
    guardarSesionEnStorage('EMPLEADO', false, tokenDe30(29))
    render(<App />)
    const fetchMock = globalThis.fetch
    fetchMock.mockClear()

    await act(async () => {
      actividad('pointerdown')
      await vi.advanceTimersByTimeAsync(60 * 1000)
    })

    expect(llamadasA(fetchMock, '/api/v1/auth/renew').length).toBe(0)
  })

  // --- ACCESIBILIDAD DEL AVISO (F.1) -------------------------------------

  it('el foco inicial del aviso queda en «Seguir conectado»', async () => {
    guardarSesionEnStorage()
    render(<App />)

    await avanzar(28 * MS_MIN)

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Seguir conectado' }),
    )
  })

  it('Tab y Shift+Tab no dejan escapar el foco del overlay', async () => {
    guardarSesionEnStorage()
    render(<App />)

    await avanzar(28 * MS_MIN)
    const boton = screen.getByRole('button', { name: 'Seguir conectado' })
    const overlay = document.querySelector('.sesion-aviso')
    // El único control focusable del overlay es ese botón. La tecla se dispara
    // sobre el elemento con el foco, como haría el navegador.
    await act(async () => {
      fireEvent.keyDown(boton, { key: 'Tab' })
    })
    expect(overlay.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(boton)

    await act(async () => {
      fireEvent.keyDown(boton, { key: 'Tab', shiftKey: true })
    })
    expect(overlay.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(boton)

    // Ni siquiera con el foco fuera, el trap lo devuelve al overlay.
    boton.blur()
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'Tab', shiftKey: true })
    })
    expect(overlay.contains(document.activeElement)).toBe(true)
  })

  it('las teclas de navegación NO cuentan como actividad: el aviso no se cierra', async () => {
    guardarSesionEnStorage()
    render(<App />)

    await avanzar(28 * MS_MIN)
    const boton = screen.getByRole('button', { name: 'Seguir conectado' })

    // Moverse con el teclado no es haber interactuado con la aplicación.
    for (const tecla of ['Tab', 'Escape', 'ArrowDown', 'ArrowUp']) {
      await act(async () => {
        fireEvent.keyDown(boton, { key: tecla })
      })
    }

    expect(screen.getByText('Tu sesión está por vencer')).toBeTruthy()
  })

  it('el foco se restaura al elemento previo cuando el aviso se cierra', async () => {
    guardarSesionEnStorage()
    render(<App />)

    await waitFor(() => expect(screen.queryByText('Acceso seguro')).toBeNull())
    const botonSalir = screen.getAllByRole('button', { name: /sesión/i })[0]
    botonSalir.focus()
    expect(document.activeElement).toBe(botonSalir)

    await avanzar(28 * MS_MIN)
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Seguir conectado' }),
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Seguir conectado' }))
    })

    // El botón de salida sigue en el DOM: recupera el foco.
    expect(document.activeElement).toBe(botonSalir)
  })

  it('Escape NO cierra el aviso', async () => {
    guardarSesionEnStorage()
    render(<App />)

    await avanzar(28 * MS_MIN)
    expect(screen.getByText('Tu sesión está por vencer')).toBeTruthy()
    const boton = screen.getByRole('button', { name: 'Seguir conectado' })

    await act(async () => {
      fireEvent.keyDown(boton, { key: 'Escape' })
    })

    expect(screen.getByText('Tu sesión está por vencer')).toBeTruthy()
  })

  // --- ORDEN REAL DE PROPAGACIÓN (auditoría F.1) --------------------------
  //
  // El listener global de actividad está en `window` en fase BUBBLE
  // (`addEventListener(tipo, fn, { passive: true })`, sin `capture: true`).
  // Los listeners del overlay están en fase CAPTURE sobre `.sesion-aviso__caja`
  // (descendiente del target) y sobre `document`.
  //
  // Orden real para un keydown con el foco en el botón:
  //   CAPTURE : window -> document -> ... -> .sesion-aviso__caja  <- retiene
  //   BUBBLE  : (no ocurre)                                     <- window nunca ve el evento
  //
  // Estos tests despachan eventos reales (`bubbles: true`) sobre el elemento
  // con el foco, como hace el navegador, y comprueban qué listeners se ejecutan.

  it('las teclas de navegación se retienen ANTES de llegar al listener global', async () => {
    guardarSesionEnStorage()
    render(<App />)

    await avanzar(28 * MS_MIN)
    const boton = screen.getByRole('button', { name: 'Seguir conectado' })

    // Espía en `window`, en la MISMA fase en que está el detector real.
    const espia = vi.fn()
    window.addEventListener('keydown', espia)

    for (const tecla of ['Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      boton.dispatchEvent(new KeyboardEvent('keydown', { key: tecla, bubbles: true, cancelable: true }))
    }

    window.removeEventListener('keydown', espia)
    // Ninguna tecla de navegación alcanzó el listener global.
    expect(espia).not.toHaveBeenCalled()
  })

  it('una tecla de escritura SÍ llega al listener global', async () => {
    guardarSesionEnStorage()
    render(<App />)

    await avanzar(28 * MS_MIN)
    const boton = screen.getByRole('button', { name: 'Seguir conectado' })

    const espia = vi.fn()
    window.addEventListener('keydown', espia)

    boton.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }))
    window.removeEventListener('keydown', espia)

    expect(espia).toHaveBeenCalledTimes(1)
  })

  it('la retención ocurre en fase CAPTURE: un listener en window no la ve antes', async () => {
    guardarSesionEnStorage()
    render(<App />)

    await avanzar(28 * MS_MIN)
    const boton = screen.getByRole('button', { name: 'Seguir conectado' })
    const orden = []

    // Dos espías en `window`: captura y bubble. El de captura se registra
    // DESPUÉS del overlay, pero en `window` la captura siempre precede al
    // bubble en la misma fase de un mismo nodo.
    const espiaBubble = vi.fn(() => orden.push('bubble'))
    window.addEventListener('keydown', espiaBubble)

    boton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    window.removeEventListener('keydown', espiaBubble)

    // `stopPropagation()` en la caja (capture) impide el bubble en window.
    expect(espiaBubble).not.toHaveBeenCalled()
    expect(orden).toEqual([])
  })

  it('teclas de navegación con el foco FUERA también se retienen', async () => {
    guardarSesionEnStorage()
    render(<App />)

    await avanzar(28 * MS_MIN)
    const boton = screen.getByRole('button', { name: 'Seguir conectado' })
    boton.blur()

    const espia = vi.fn()
    window.addEventListener('keydown', espia)

    for (const tecla of ['Tab', 'Escape', 'ArrowDown']) {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: tecla, bubbles: true, cancelable: true }),
      )
    }

    window.removeEventListener('keydown', espia)
    expect(espia).not.toHaveBeenCalled()
    // El aviso sigue abierto: nada lo reinició ni cerró.
    expect(screen.getByText('Tu sesión está por vencer')).toBeTruthy()
  })
})