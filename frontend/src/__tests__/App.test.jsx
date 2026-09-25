// Enrutamiento por sesión, rol y primer acceso (PRD §3, §21.2; ET §31).
// La API se mockea: sin llamadas reales al backend.

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  actualizarSesion,
  cambiarPassword,
  guardarSesion,
  iniciarSesion,
  limpiarSesion,
  obtenerSesion,
} from '../api/autenticacion.js'
import { obtenerProgreso } from '../api/progreso.js'
import { obtenerCuenta } from '../api/cuenta.js'
import { obtenerAtencionRequerida, obtenerEmpleadosActivos, obtenerProyectosActivos } from '../api/dashboardRh.js'
import App from '../App.jsx'
import { crearRespuesta } from '../vistas/__tests__/ayuda.js'

vi.mock('../api/autenticacion.js', () => ({
  actualizarSesion: vi.fn(),
  cambiarPassword: vi.fn(),
  guardarSesion: vi.fn(),
  iniciarSesion: vi.fn(),
  limpiarSesion: vi.fn(),
  obtenerSesion: vi.fn(),
}))

vi.mock('../api/progreso.js', () => ({ obtenerProgreso: vi.fn() }))
vi.mock('../api/dashboardRh.js', () => ({ obtenerAtencionRequerida: vi.fn(), obtenerEmpleadosActivos: vi.fn(), obtenerProyectosActivos: vi.fn() }))

// La cuenta del header (§11) se mockea resuelta para no depender de la red.
vi.mock('../api/cuenta.js', () => ({
  obtenerCuenta: vi.fn().mockResolvedValue({ email: 'persona@empresa.dev' }),
}))

const EMPLEADO = { token: 'token-empleado', rol: 'EMPLEADO', mustChangePassword: false }
const EMPLEADO_TEMPORAL = { token: 'token-temporal', rol: 'EMPLEADO', mustChangePassword: true }
const RH = { token: 'token-rh', rol: 'RH', mustChangePassword: false }

beforeEach(() => {
  vi.mocked(obtenerSesion).mockReset()
  vi.mocked(iniciarSesion).mockReset()
  vi.mocked(guardarSesion).mockReset()
  vi.mocked(limpiarSesion).mockReset()
  vi.mocked(actualizarSesion).mockReset()
  vi.mocked(cambiarPassword).mockReset()
  vi.mocked(obtenerProgreso).mockReset()
  vi.mocked(obtenerCuenta).mockReset()
  vi.mocked(obtenerEmpleadosActivos).mockReset()
  vi.mocked(obtenerProyectosActivos).mockReset()
  vi.mocked(obtenerAtencionRequerida).mockReset()
  vi.mocked(obtenerCuenta).mockResolvedValue({ email: 'persona@empresa.dev' })
  vi.mocked(obtenerEmpleadosActivos).mockResolvedValue({ total: 12, items: [] })
  vi.mocked(obtenerProyectosActivos).mockResolvedValue({ total: 4, items: [] })
  vi.mocked(obtenerAtencionRequerida).mockResolvedValue({ total: 0, items: [] })
})

/** Llena el formulario de acceso y envía las credenciales. */
async function entrarCon(sesion) {
  vi.mocked(iniciarSesion).mockResolvedValue(sesion)

  fireEvent.change(screen.getByLabelText('Correo de acceso'), {
    target: { value: 'persona@empresa.dev' },
  })
  fireEvent.change(screen.getByLabelText('Contraseña'), {
    target: { value: 'temporal1' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

  await waitFor(() => expect(guardarSesion).toHaveBeenCalledWith(sesion))
}

/** Llena y envía el formulario de cambio de contraseña. */
function cambiarContrasena(nueva = 'nueva123') {
  fireEvent.change(screen.getByLabelText('Nueva contraseña'), {
    target: { value: nueva },
  })
  fireEvent.change(screen.getByLabelText('Repite la nueva contraseña'), {
    target: { value: nueva },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
}

describe('App — enrutamiento de sesión', () => {
  it('sin sesión muestra el inicio de sesión', () => {
    vi.mocked(obtenerSesion).mockReturnValue(null)

    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Inicia sesión' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Competencias' }),
    ).not.toBeInTheDocument()
  })

  it('restaura la sesión guardada sin volver a pedir credenciales', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    vi.mocked(obtenerProgreso).mockResolvedValue(crearRespuesta())

    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Competencias' }),
    ).toBeInTheDocument()
    expect(obtenerProgreso).toHaveBeenCalledWith('token-empleado')
  })
})

describe('App — primer acceso', () => {
  it('empleado con credencial temporal ve el cambio de contraseña (no Mi progreso)', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(null)
    render(<App />)

    await entrarCon(EMPLEADO_TEMPORAL)

    expect(
      await screen.findByRole('heading', { name: 'Primer acceso' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Nueva contraseña')).toBeInTheDocument()
    expect(obtenerProgreso).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('heading', { name: 'Competencias' }),
    ).not.toBeInTheDocument()
  })

  it('empleado con contraseña definitiva ve Mi progreso', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(null)
    vi.mocked(obtenerProgreso).mockResolvedValue(crearRespuesta())
    render(<App />)

    await entrarCon(EMPLEADO)

    expect(
      await screen.findByRole('heading', { name: 'Competencias' }),
    ).toBeInTheDocument()
    expect(obtenerProgreso).toHaveBeenCalledWith('token-empleado')
  })

  it('al cambiar la contraseña se puede continuar hasta Mi progreso', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(null)
    vi.mocked(cambiarPassword).mockResolvedValue({
      mensaje: 'Contraseña actualizada.',
    })
    vi.mocked(actualizarSesion).mockReturnValue(EMPLEADO)
    vi.mocked(obtenerProgreso).mockResolvedValue(crearRespuesta())
    render(<App />)

    await entrarCon(EMPLEADO_TEMPORAL)
    cambiarContrasena()

    expect(
      await screen.findByRole('heading', { name: 'Competencias' }),
    ).toBeInTheDocument()
    expect(cambiarPassword).toHaveBeenCalledWith('token-temporal', 'nueva123')
    expect(actualizarSesion).toHaveBeenCalledWith({ mustChangePassword: false })
  })

  it('un 401 durante el primer acceso cierra la sesión', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(null)
    vi.mocked(cambiarPassword).mockRejectedValue(
      Object.assign(new Error('Credenciales inválidas.'), { estado: 401 }),
    )
    render(<App />)

    await entrarCon(EMPLEADO_TEMPORAL)
    cambiarContrasena()

    expect(
      await screen.findByRole('heading', { name: 'Inicia sesión' }),
    ).toBeInTheDocument()
    expect(limpiarSesion).toHaveBeenCalled()
  })
})

describe('App — rol RH', () => {
  it('RH no entra a Mi progreso', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(null)
    render(<App />)

    await entrarCon(RH)

    expect(
      (await screen.findAllByRole('heading', { level: 1, name: 'Inicio' }))[0],
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Empleados activos' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Proyectos activos' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: 'Atención requerida' })).toHaveLength(2)
    expect(obtenerProgreso).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('heading', { name: 'Competencias' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: '¿Cómo voy?' }),
    ).not.toBeInTheDocument()
  })

  it('RH con credencial temporal primero cambia la contraseña', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(null)
    render(<App />)

    await entrarCon({ ...RH, mustChangePassword: true })

    expect(
      await screen.findByRole('heading', { name: 'Primer acceso' }),
    ).toBeInTheDocument()
    // Sin shell ni navegación hasta cambiar la contraseña.
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Crear empleado' }),
    ).not.toBeInTheDocument()
  })
})

describe('App — sesión expirada', () => {
  it('un 401 en Mi progreso cierra la sesión y vuelve al inicio de sesión', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    vi.mocked(obtenerProgreso).mockRejectedValue(
      Object.assign(new Error('Credenciales inválidas.'), { estado: 401 }),
    )

    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Inicia sesión' }),
    ).toBeInTheDocument()
    expect(limpiarSesion).toHaveBeenCalled()
  })
})
