// Restablecimiento de contraseña, paso 2 (PRD §3.4/§3.5; DECISIONES §4/§53).
// La API se mockea: sin llamadas reales al backend.

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { restablecerPassword } from '../../api/autenticacion.js'
import RestablecerContrasena from '../RestablecerContrasena.jsx'

vi.mock('../../api/autenticacion.js', () => ({
  restablecerPassword: vi.fn(),
}))

function renderizar() {
  const alVolverLogin = vi.fn()
  const alSolicitarOtro = vi.fn()
  render(
    <RestablecerContrasena
      alVolverLogin={alVolverLogin}
      alSolicitarOtro={alSolicitarOtro}
    />,
  )
  return { alVolverLogin, alSolicitarOtro }
}

function escribir(
  token = 'token-de-prueba-64-caracteres',
  nueva = 'nueva1234',
  repetir = nueva,
) {
  fireEvent.change(screen.getByLabelText('Token de recuperación'), {
    target: { value: token },
  })
  fireEvent.change(screen.getByLabelText('Nueva contraseña'), {
    target: { value: nueva },
  })
  fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), {
    target: { value: repetir },
  })
}

function enviar() {
  fireEvent.click(
    screen.getByRole('button', {
      name: /Restablecer contraseña|Restableciendo/,
    }),
  )
}

beforeEach(() => {
  vi.mocked(restablecerPassword).mockReset()
  localStorage.clear()
  sessionStorage.clear()
})

describe('RestablecerContrasena — formulario', () => {
  it('muestra los tres campos etiquetados y la política visible', () => {
    renderizar()

    expect(screen.getByLabelText('Token de recuperación')).toBeInTheDocument()
    expect(screen.getByLabelText('Nueva contraseña')).toBeInTheDocument()
    expect(
      screen.getByLabelText('Confirmar nueva contraseña'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Mínimo 8 caracteres y al menos un número/),
    ).toBeInTheDocument()
  })

  it('no envía nada sin token', () => {
    renderizar()
    escribir('  ', 'nueva1234')

    enviar()

    expect(screen.getByRole('alert')).toHaveTextContent('Pega el token')
    expect(restablecerPassword).not.toHaveBeenCalled()
  })

  it('no envía nada si las contraseñas no coinciden', () => {
    renderizar()
    escribir('token-x', 'nueva1234', 'otra1234')

    enviar()

    expect(screen.getByRole('alert')).toHaveTextContent('no coinciden')
    expect(restablecerPassword).not.toHaveBeenCalled()
  })

  it('valida la política visible en el cliente sin reemplazar al backend', () => {
    renderizar()

    escribir('token-x', 'corta1') // menos de 8
    enviar()
    expect(screen.getByRole('alert')).toHaveTextContent('8 caracteres')
    expect(restablecerPassword).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Nueva contraseña'), {
      target: { value: 'sinnumeros' },
    })
    fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), {
      target: { value: 'sinnumeros' },
    })
    enviar()
    expect(screen.getByRole('alert')).toHaveTextContent('un número')
    expect(restablecerPassword).not.toHaveBeenCalled()
  })

  it('el token se recorta SOLO por los extremos: el valor no se transforma', () => {
    vi.mocked(restablecerPassword).mockReturnValue(new Promise(() => {}))
    renderizar()
    escribir('  token-con-guiones_y-puntos  ')

    enviar()

    expect(restablecerPassword).toHaveBeenCalledWith(
      'token-con-guiones_y-puntos',
      'nueva1234',
    )
  })

  it('evita el doble envío mientras la petición está pendiente', () => {
    vi.mocked(restablecerPassword).mockReturnValue(new Promise(() => {}))
    renderizar()
    escribir()

    enviar()
    enviar()

    expect(restablecerPassword).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /Restableciendo/ })).toBeDisabled()
  })
})

describe('RestablecerContrasena — resultados', () => {
  it('éxito: confirma y permite volver al login; limpia los valores', async () => {
    vi.mocked(restablecerPassword).mockResolvedValue({
      mensaje: 'Contraseña restablecida.',
    })
    const { alVolverLogin } = renderizar()
    escribir('token-secreto-xyz', 'nueva1234')

    enviar()

    expect(await screen.findByText('Contraseña restablecida.')).toBeInTheDocument()
    // El formulario desaparece: token y contraseñas ya no viven en pantalla.
    expect(screen.queryByLabelText('Token de recuperación')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument()
    // Y no quedaron en ningún almacenamiento ni en la URL.
    expect(localStorage.getItem('talento.sesion')).toBeNull()
    expect(JSON.stringify(sessionStorage)).not.toContain('token-secreto-xyz')
    expect(window.location.search).not.toContain('token')

    fireEvent.click(screen.getByRole('button', { name: /Ir a iniciar sesión/ }))
    expect(alVolverLogin).toHaveBeenCalledTimes(1)
  })

  it('400: mensaje uniforme del backend y salida para pedir uno nuevo', async () => {
    vi.mocked(restablecerPassword).mockRejectedValue(
      Object.assign(new Error('Token inválido o expirado.'), { estado: 400 }),
    )
    const { alSolicitarOtro } = renderizar()
    escribir()

    enviar()

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Token inválido o expirado.')
    // No intenta distinguir la causa y el formulario sigue para reintentar.
    expect(screen.getByLabelText('Token de recuperación')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: /Solicitar un token nuevo/ }),
    )
    expect(alSolicitarOtro).toHaveBeenCalledTimes(1)
  })

  it('422: error comprensible, sin detalle técnico', async () => {
    vi.mocked(restablecerPassword).mockRejectedValue(
      Object.assign(new Error('Value error, la contraseña es demasiado corta'), {
        estado: 422,
      }),
    )
    renderizar()
    escribir()

    enviar()

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('no cumple los requisitos indicados')
    expect(alerta.textContent).not.toContain('Value error')
  })

  it('error de red: mensaje legible y reintento disponible', async () => {
    vi.mocked(restablecerPassword)
      .mockRejectedValueOnce(
        Object.assign(
          new Error(
            'No fue posible conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.',
          ),
          { estado: 0 },
        ),
      )
      .mockResolvedValueOnce({ mensaje: 'Contraseña restablecida.' })
    renderizar()
    escribir()

    enviar()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No fue posible conectar con el servidor',
    )

    // El reintento con la misma información sigue disponible.
    enviar()
    expect(await screen.findByText('Contraseña restablecida.')).toBeInTheDocument()
    expect(restablecerPassword).toHaveBeenCalledTimes(2)
  })
})