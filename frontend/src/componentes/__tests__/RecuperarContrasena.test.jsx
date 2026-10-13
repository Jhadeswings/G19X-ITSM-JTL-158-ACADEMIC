// Recuperación de acceso, paso 1 (PRD §3.4; DECISIONES §3/§53).
// La API se mockea: sin llamadas reales al backend.

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { solicitarRecuperacion } from '../../api/autenticacion.js'
import RecuperarContrasena from '../RecuperarContrasena.jsx'

vi.mock('../../api/autenticacion.js', () => ({
  solicitarRecuperacion: vi.fn(),
}))

const MENSAJE = 'Si el correo corresponde a una cuenta activa, recibirás instrucciones para restablecer tu acceso.'

function renderizar() {
  const alVolverLogin = vi.fn()
  const alIrAToken = vi.fn()
  render(
    <RecuperarContrasena alVolverLogin={alVolverLogin} alIrAToken={alIrAToken} />,
  )
  return { alVolverLogin, alIrAToken }
}

function escribirCorreo(valor = 'persona@empresa.dev') {
  fireEvent.change(screen.getByLabelText('Correo de acceso'), {
    target: { value: valor },
  })
}

function enviar() {
  fireEvent.click(
    screen.getByRole('button', {
      name: /Enviar instrucciones|Enviando/,
    }),
  )
}

beforeEach(() => {
  vi.mocked(solicitarRecuperacion).mockReset()
})

describe('RecuperarContrasena — formulario', () => {
  it('muestra el campo etiquetado, el botón y la vuelta al login', () => {
    const { alVolverLogin } = renderizar()

    expect(screen.getByLabelText('Correo de acceso')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Enviar instrucciones/ }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: /Volver al inicio de sesión/ }),
    )
    expect(alVolverLogin).toHaveBeenCalledTimes(1)
  })

  it('valida el formato del correo localmente, sin llamar a la API', () => {
    renderizar()
    // 'persona@empresa' (sin dominio de nivel superior) pasa la validación
    // nativa de input[type=email] de jsdom, así que el submit LLEGA al
    // handler: ahí el espejo local del EmailStr lo rechaza.
    escribirCorreo('persona@empresa')

    enviar()

    expect(screen.getByRole('alert')).toHaveTextContent('correo de acceso válido')
    expect(solicitarRecuperacion).not.toHaveBeenCalled()
  })
})

describe('RecuperarContrasena — resultados', () => {
  it('muestra TAL CUAL el mensaje uniforme del backend (202)', async () => {
    vi.mocked(solicitarRecuperacion).mockResolvedValue({ mensaje: MENSAJE })
    renderizar()
    escribirCorreo()

    enviar()

    const alerta = await screen.findByRole('status')
    expect(alerta).toHaveTextContent(MENSAJE)
    // Neutralidad (PRD §3.4): no afirma entrega ni existencia de la cuenta.
    expect(alerta.textContent).not.toMatch(/se (envió|entregó) un correo/i)
    expect(alerta.textContent).not.toMatch(/cuenta (existe|registrada)/i)
  })

  it('tras la confirmación ofrece avanzar a la entrada del token', async () => {
    vi.mocked(solicitarRecuperacion).mockResolvedValue({ mensaje: MENSAJE })
    const { alIrAToken } = renderizar()
    escribirCorreo()

    enviar()

    fireEvent.click(
      await screen.findByRole('button', {
        name: /Introducir token de recuperación/,
      }),
    )
    expect(alIrAToken).toHaveBeenCalledTimes(1)
  })

  it('evita el doble envío mientras la petición está pendiente', () => {
    vi.mocked(solicitarRecuperacion).mockReturnValue(new Promise(() => {}))
    renderizar()
    escribirCorreo()

    enviar()
    enviar()

    expect(solicitarRecuperacion).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('button', { name: /Enviando/ }),
    ).toBeDisabled()
  })

  it('un 422 se muestra comprensible, sin detalle técnico', async () => {
    vi.mocked(solicitarRecuperacion).mockRejectedValue(
      Object.assign(new Error('Value error, not a valid email'), {
        estado: 422,
      }),
    )
    renderizar()
    escribirCorreo()

    enviar()

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('formato no es válido')
    expect(alerta.textContent).not.toContain('Value error')
  })

  it('un error de red se muestra neutro: no revela nada de la cuenta', async () => {
    vi.mocked(solicitarRecuperacion).mockRejectedValue(
      Object.assign(
        new Error(
          'No fue posible conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.',
        ),
        { estado: 0 },
      ),
    )
    renderizar()
    escribirCorreo()

    enviar()

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('No fue posible conectar con el servidor')
    expect(alerta.textContent).not.toMatch(/empresa\.dev/i)
  })
})