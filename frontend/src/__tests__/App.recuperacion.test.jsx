// Enrutamiento del shell público de recuperación (H1, PRD §3.4): login ↔
// recuperar ↔ restablecer con estados locales, sin rutas nuevas. La API se
// mockea: sin llamadas reales al backend.

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerSesion } from '../api/autenticacion.js'
import App from '../App.jsx'

vi.mock('../api/autenticacion.js', () => ({
  actualizarSesion: vi.fn(),
  cambiarPassword: vi.fn(),
  cambiarPasswordConActual: vi.fn(),
  guardarSesion: vi.fn(),
  iniciarSesion: vi.fn(),
  limpiarSesion: vi.fn(),
  obtenerSesion: vi.fn(),
  renovarSesion: vi.fn(),
  solicitarRecuperacion: vi.fn(),
  restablecerPassword: vi.fn(),
}))

vi.mock('../api/cuenta.js', () => ({ obtenerCuenta: vi.fn() }))

beforeEach(() => {
  vi.mocked(obtenerSesion).mockReset().mockReturnValue(null)
})

describe('App — shell público de recuperación (H1)', () => {
  it('el login ofrece «¿Olvidaste tu contraseña?» y abre Recuperar acceso', () => {
    render(<App />)

    fireEvent.click(
      screen.getByRole('button', { name: '¿Olvidaste tu contraseña?' }),
    )

    expect(
      screen.getByRole('heading', { name: 'Recuperar acceso' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
  })

  it('desde la recuperación siempre se puede volver al login', () => {
    render(<App />)

    fireEvent.click(
      screen.getByRole('button', { name: '¿Olvidaste tu contraseña?' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: /Volver al inicio de sesión/ }),
    )

    expect(
      screen.getByRole('heading', { name: 'Inicia sesión' }),
    ).toBeInTheDocument()
  })

  it('el login abre directamente el restablecimiento para quien ya tiene token', () => {
    render(<App />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Ya tengo un token de recuperación' }),
    )

    expect(
      screen.getByRole('heading', { name: 'Restablecer contraseña' }),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText('Token de recuperación'),
    ).toBeInTheDocument()
  })

  it('desde el restablecimiento se puede solicitar un token nuevo', () => {
    render(<App />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Ya tengo un token de recuperación' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: /Solicitar un token nuevo/ }),
    )

    expect(
      screen.getByRole('heading', { name: 'Recuperar acceso' }),
    ).toBeInTheDocument()
  })
})