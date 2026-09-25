// Primer acceso: cambio obligatorio de contraseña (PRD §3.3/§3.5).
// La API se mockea: sin llamadas reales al backend.

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cambiarPassword } from '../../api/autenticacion.js'
import CambioContrasena from '../CambioContrasena.jsx'

vi.mock('../../api/autenticacion.js', () => ({ cambiarPassword: vi.fn() }))

function renderizar() {
  const alCambiar = vi.fn()
  const alCerrarSesion = vi.fn()
  render(
    <CambioContrasena
      token="token-1"
      alCambiar={alCambiar}
      alCerrarSesion={alCerrarSesion}
    />,
  )
  return { alCambiar, alCerrarSesion }
}

function escribir(nueva, repetir = nueva) {
  fireEvent.change(screen.getByLabelText('Nueva contraseña'), {
    target: { value: nueva },
  })
  fireEvent.change(screen.getByLabelText('Repite la nueva contraseña'), {
    target: { value: repetir },
  })
}

function enviar() {
  fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
}

beforeEach(() => {
  vi.mocked(cambiarPassword).mockReset()
})

describe('CambioContrasena — formulario', () => {
  it('muestra los dos campos etiquetados y el requisito de la política', () => {
    renderizar()

    expect(screen.getByLabelText('Nueva contraseña')).toBeInTheDocument()
    expect(
      screen.getByLabelText('Repite la nueva contraseña'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Mínimo 8 caracteres y al menos un número/),
    ).toBeInTheDocument()
  })

  it('no envía nada si las dos contraseñas no coinciden', async () => {
    renderizar()
    escribir('nueva123', 'otra1234')

    enviar()

    expect(await screen.findByRole('alert')).toHaveTextContent('no coinciden')
    expect(cambiarPassword).not.toHaveBeenCalled()
  })
})

describe('CambioContrasena — resultados', () => {
  it('un cambio exitoso permite continuar', async () => {
    vi.mocked(cambiarPassword).mockResolvedValue({
      mensaje: 'Contraseña actualizada.',
    })
    const { alCambiar } = renderizar()
    escribir('nueva123')

    enviar()

    await waitFor(() => expect(alCambiar).toHaveBeenCalledTimes(1))
    expect(cambiarPassword).toHaveBeenCalledWith('token-1', 'nueva123')
  })

  it('un error de política se muestra legible y sin detalles técnicos', async () => {
    vi.mocked(cambiarPassword).mockRejectedValue(
      Object.assign(new Error('Value error, la contraseña es demasiado corta'), {
        estado: 422,
      }),
    )
    const { alCambiar, alCerrarSesion } = renderizar()
    escribir('corta1')

    enviar()

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('no cumple los requisitos indicados')
    expect(alerta).not.toHaveTextContent('Value error')
    expect(alCambiar).not.toHaveBeenCalled()
    expect(alCerrarSesion).not.toHaveBeenCalled()
  })

  it('un error de conexión se muestra legible', async () => {
    vi.mocked(cambiarPassword).mockRejectedValue(
      Object.assign(
        new Error('No fue posible conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.'),
        { estado: 0 },
      ),
    )
    renderizar()
    escribir('nueva123')

    enviar()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No fue posible conectar con el servidor',
    )
  })

  it('un 401 cierra la sesión', async () => {
    vi.mocked(cambiarPassword).mockRejectedValue(
      Object.assign(new Error('Credenciales inválidas.'), { estado: 401 }),
    )
    const { alCambiar, alCerrarSesion } = renderizar()
    escribir('nueva123')

    enviar()

    await waitFor(() => expect(alCerrarSesion).toHaveBeenCalledTimes(1))
    expect(alCambiar).not.toHaveBeenCalled()
  })

  it('permite cerrar sesión sin cambiar la contraseña', () => {
    const { alCerrarSesion } = renderizar()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(alCerrarSesion).toHaveBeenCalledTimes(1)
    expect(cambiarPassword).not.toHaveBeenCalled()
  })
})
