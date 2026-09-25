// Shell y navegación del rol Empleado (Style Guide §7, §10, §11; PRD §21).
// La API se mockea: sin llamadas reales al backend.

import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { limpiarSesion, obtenerSesion } from '../api/autenticacion.js'
import { obtenerCuenta } from '../api/cuenta.js'
import { obtenerProgreso } from '../api/progreso.js'
import App from '../App.jsx'
import { SECCIONES_EMPLEADO } from '../navegacion.js'
import { crearRespuesta } from '../vistas/__tests__/ayuda.js'

vi.mock('../api/autenticacion.js', () => ({
  actualizarSesion: vi.fn(),
  cambiarPassword: vi.fn(),
  guardarSesion: vi.fn(),
  iniciarSesion: vi.fn(),
  limpiarSesion: vi.fn(),
  obtenerSesion: vi.fn(),
}))

vi.mock('../api/cuenta.js', () => ({ obtenerCuenta: vi.fn() }))
vi.mock('../api/progreso.js', () => ({ obtenerProgreso: vi.fn() }))

const EMPLEADO = { token: 'token-empleado', rol: 'EMPLEADO', mustChangePassword: false }
const EMPLEADO_TEMPORAL = { token: 'token-temporal', rol: 'EMPLEADO', mustChangePassword: true }
const RH = { token: 'token-rh', rol: 'RH', mustChangePassword: false }

beforeEach(() => {
  vi.mocked(obtenerSesion).mockReset()
  vi.mocked(limpiarSesion).mockReset()
  vi.mocked(obtenerCuenta).mockReset()
  vi.mocked(obtenerProgreso).mockReset()
  vi.mocked(obtenerCuenta).mockResolvedValue({
    email: 'persona@empresa.dev',
    empleado_nombre: 'Ana López',
  })
  vi.mocked(obtenerProgreso).mockResolvedValue(crearRespuesta())
})

function navegacion() {
  return screen.getByRole('navigation', { name: 'Navegación principal' })
}

function abrir(seccion) {
  fireEvent.click(within(navegacion()).getByRole('button', { name: seccion }))
}

describe('Shell de Empleado — layout', () => {
  it('muestra las seis secciones del Style Guide §10 en orden', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    render(<App />)
    await screen.findByRole('heading', { name: 'Competencias' })

    const etiquetas = within(navegacion())
      .getAllByRole('button')
      .map((boton) => boton.textContent)

    expect(etiquetas).toEqual(SECCIONES_EMPLEADO.map((seccion) => seccion.titulo))
  })

  it('abre Mi progreso por defecto (única vista funcional)', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Competencias' }),
    ).toBeInTheDocument()
    expect(
      within(navegacion()).getByRole('button', { name: 'Mi progreso' }),
    ).toHaveAttribute('aria-current', 'page')
    expect(obtenerProgreso).toHaveBeenCalledWith('token-empleado')
  })

  it('el header muestra el título de la sección y la cuenta autenticada', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    render(<App />)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mi progreso' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Ana López')).toBeInTheDocument()
    expect(obtenerCuenta).toHaveBeenCalledWith('token-empleado')
  })
})

describe('Shell de Empleado — navegación entre secciones', () => {
  it('las secciones no implementadas muestran un estado temporal neutro', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    render(<App />)
    await screen.findByRole('heading', { name: 'Competencias' })

    abrir('Mis proyectos')

    expect(
      await screen.findByText('«Mis proyectos» todavía no está disponible'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Competencias' }),
    ).not.toBeInTheDocument()
    // El estado temporal no inventa datos ni vuelve a consultar la API.
    expect(obtenerProgreso).toHaveBeenCalledTimes(1)
  })

  it('las cinco secciones pendientes tienen su propio estado temporal', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    render(<App />)
    await screen.findByRole('heading', { name: 'Competencias' })

    for (const titulo of [
      'Inicio',
      'Mis proyectos',
      'Mis capacitaciones',
      'Mi historial',
      'Mi cuenta',
    ]) {
      abrir(titulo)
      expect(
        screen.getByText(`«${titulo}» todavía no está disponible`),
      ).toBeInTheDocument()
    }
    expect(obtenerProgreso).toHaveBeenCalledTimes(1)
  })

  it('marca la sección activa y actualiza el título del header', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    render(<App />)
    await screen.findByRole('heading', { name: 'Competencias' })

    abrir('Mi cuenta')

    expect(
      screen.getByRole('heading', { level: 1, name: 'Mi cuenta' }),
    ).toBeInTheDocument()
    expect(
      within(navegacion()).getByRole('button', { name: 'Mi cuenta' }),
    ).toHaveAttribute('aria-current', 'page')
    expect(
      within(navegacion()).getByRole('button', { name: 'Mi progreso' }),
    ).not.toHaveAttribute('aria-current')
  })

  it('volver a Mi progreso recupera la vista funcional', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    render(<App />)
    await screen.findByRole('heading', { name: 'Competencias' })

    abrir('Mi historial')
    abrir('Mi progreso')

    expect(
      await screen.findByRole('heading', { name: 'Competencias' }),
    ).toBeInTheDocument()
  })

  it('el cierre de sesión sigue funcionando desde cualquier sección', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    render(<App />)
    await screen.findByRole('heading', { name: 'Competencias' })
    abrir('Mi cuenta')

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(
      await screen.findByRole('heading', { name: 'Inicia sesión' }),
    ).toBeInTheDocument()
    expect(limpiarSesion).toHaveBeenCalled()
  })
})

describe('Shell de Empleado — sesión y roles', () => {
  it('el empleado con credencial temporal sigue en el primer acceso, sin shell', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO_TEMPORAL)
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Primer acceso' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(obtenerProgreso).not.toHaveBeenCalled()
  })

  it('RH no entra al shell de Empleado', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(RH)
    render(<App />)

    expect(
      await screen.findByText('Las vistas de RH todavía no están disponibles'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Mi progreso' }),
    ).not.toBeInTheDocument()
    expect(obtenerProgreso).not.toHaveBeenCalled()
    expect(obtenerCuenta).not.toHaveBeenCalled()
  })

  it('si la cuenta no está disponible, el header no inventa identidad', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    vi.mocked(obtenerCuenta).mockRejectedValue(
      Object.assign(new Error('sin conexión'), { estado: 0 }),
    )
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Competencias' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Ana López')).not.toBeInTheDocument()
  })

  it('un 401 al consultar la cuenta cierra la sesión', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    vi.mocked(obtenerCuenta).mockRejectedValue(
      Object.assign(new Error('Credenciales inválidas.'), { estado: 401 }),
    )
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Inicia sesión' }),
    ).toBeInTheDocument()
    expect(limpiarSesion).toHaveBeenCalled()
  })
})
