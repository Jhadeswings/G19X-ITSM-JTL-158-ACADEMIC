// Cambio voluntario de contraseña desde "Mi cuenta" (PRD §21.6): cuenta con
// contraseña definitiva, donde el backend EXIGE `password_actual`. La API se
// mockea: sin llamadas reales al backend.
//
// No se toca `CambioContrasena.test.jsx`: ese archivo cubre el onboarding de
// primer acceso, que es un flujo distinto y ya cerrado.

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cambiarPasswordConActual } from '../../api/autenticacion.js'
import CambioPasswordCuenta from '../CambioPasswordCuenta.jsx'

vi.mock('../../api/autenticacion.js', () => ({
  cambiarPasswordConActual: vi.fn(),
}))

const MENSAJE_OK = 'Contraseña actualizada.'

function renderizar(props = {}) {
  const alSesionExpirada = vi.fn()
  const alCambiar = vi.fn()
  render(
    <CambioPasswordCuenta
      token="token-1"
      alSesionExpirada={alSesionExpirada}
      alCambiar={alCambiar}
      {...props}
    />,
  )
  return { alSesionExpirada, alCambiar }
}

function escribir({ actual, nueva, repetir }) {
  if (actual !== undefined) {
    fireEvent.change(screen.getByLabelText('Contraseña actual'), {
      target: { value: actual },
    })
  }
  if (nueva !== undefined) {
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), {
      target: { value: nueva },
    })
  }
  if (repetir !== undefined) {
    fireEvent.change(screen.getByLabelText('Confirma la nueva contraseña'), {
      target: { value: repetir },
    })
  }
}

function enviar() {
  fireEvent.click(
    screen.getByRole('button', { name: /Cambiar contraseña|Guardando/ }),
  )
}

// Dispara el submit directamente. Los `Input` llevan `required` (HTML), que en
// un navegador real bloquea el envío antes de llegar al componente; al enviar
// el formulario directamente se ejercita la validación en JavaScript, que es
// la que produce los mensajes accesibles del proyecto.
function enviarFormulario() {
  fireEvent.submit(screen.getByRole('button', { name: /Cambiar contraseña|Guardando/ }).closest('form'))
}

function completar() {
  escribir({ actual: 'actual123', nueva: 'nueva1234', repetir: 'nueva1234' })
}

beforeEach(() => {
  vi.mocked(cambiarPasswordConActual).mockReset()
  localStorage.clear()
})

describe('CambioPasswordCuenta — estructura', () => {
  it('renderiza los tres campos', () => {
    renderizar()

    expect(screen.getByLabelText('Contraseña actual')).toBeInTheDocument()
    expect(screen.getByLabelText('Nueva contraseña')).toBeInTheDocument()
    expect(
      screen.getByLabelText('Confirma la nueva contraseña'),
    ).toBeInTheDocument()
  })

  it('los campos son de tipo contraseña y muestra la política del PRD §3.5', () => {
    renderizar()

    for (const etiqueta of [
      'Contraseña actual',
      'Nueva contraseña',
      'Confirma la nueva contraseña',
    ]) {
      expect(screen.getByLabelText(etiqueta)).toHaveAttribute('type', 'password')
    }
    expect(
      screen.getByText('Mínimo 8 caracteres y al menos un número.'),
    ).toBeInTheDocument()
  })

  it('renderiza el botón de cambio', () => {
    renderizar()

    expect(
      screen.getByRole('button', { name: 'Cambiar contraseña' }),
    ).toBeInTheDocument()
  })
})
describe('CambioPasswordCuenta — validación local', () => {
  it('no envía si falta la contraseña actual', () => {
    renderizar()
    escribir({ nueva: 'nueva1234', repetir: 'nueva1234' })

    enviarFormulario()

    expect(cambiarPasswordConActual).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Escribe tu contraseña actual.',
    )
  })

  it('no envía si falta la nueva contraseña', () => {
    renderizar()
    escribir({ actual: 'actual123', repetir: 'nueva1234' })

    enviarFormulario()

    expect(cambiarPasswordConActual).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Escribe tu nueva contraseña.',
    )
  })

  it('no envía si falta la confirmación', () => {
    renderizar()
    escribir({ actual: 'actual123', nueva: 'nueva1234' })

    enviarFormulario()

    expect(cambiarPasswordConActual).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Repite tu nueva contraseña.',
    )
  })

  it('no envía si las dos contraseñas nuevas no coinciden', () => {
    renderizar()
    escribir({ actual: 'actual123', nueva: 'nueva1234', repetir: 'otra9999' })

    enviarFormulario()

    expect(cambiarPasswordConActual).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Las dos contraseñas no coinciden.',
    )
  })

  it('no juzga la fortaleza: la política la aplica el backend (422)', () => {
    // El formulario no añade requisitos: envía tal cual y deja que el esquema
    // del backend decida (PRD §3.5).
    vi.mocked(cambiarPasswordConActual).mockResolvedValue({
      mensaje: MENSAJE_OK,
    })
    renderizar()
    escribir({ actual: 'a', nueva: 'b', repetir: 'b' })

    enviarFormulario()

    expect(cambiarPasswordConActual).toHaveBeenCalledWith('token-1', 'a', 'b')
  })
})
describe('CambioPasswordCuenta — envío', () => {
  it('envía password_actual y password_nueva mediante el transporte', async () => {
    vi.mocked(cambiarPasswordConActual).mockResolvedValue({
      mensaje: MENSAJE_OK,
    })
    renderizar()
    completar()

    enviar()

    await waitFor(() => expect(cambiarPasswordConActual).toHaveBeenCalledTimes(1))
    expect(cambiarPasswordConActual).toHaveBeenCalledWith(
      'token-1',
      'actual123',
      'nueva1234',
    )
  })

  it('evita el doble submit mientras la petición está en curso', async () => {
    let liberar
    vi.mocked(cambiarPasswordConActual).mockReturnValue(
      new Promise((resolve) => {
        liberar = () => resolve({ mensaje: MENSAJE_OK })
      }),
    )
    renderizar()
    completar()

    enviar()
    enviar()
    enviar()

    expect(cambiarPasswordConActual).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled()

    liberar()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Cambiar contraseña' }),
      ).toBeEnabled(),
    )
  })

  it('el formulario no modifica la sesión por sí mismo', async () => {
    vi.mocked(cambiarPasswordConActual).mockResolvedValue({
      mensaje: MENSAJE_OK,
    })
    localStorage.setItem(
      'talento.sesion',
      JSON.stringify({
        token: 'token-1',
        rol: 'EMPLEADO',
        mustChangePassword: false,
      }),
    )
    const { alCambiar } = renderizar()
    completar()

    enviar()

    await waitFor(() => expect(alCambiar).toHaveBeenCalledTimes(1))
    expect(JSON.parse(localStorage.getItem('talento.sesion'))).toEqual({
      token: 'token-1',
      rol: 'EMPLEADO',
      mustChangePassword: false,
    })
  })

  it('no escribe mustChangePassword: no depende de ese flag', async () => {
    vi.mocked(cambiarPasswordConActual).mockResolvedValue({
      mensaje: MENSAJE_OK,
    })
    renderizar()
    completar()

    enviar()

    await waitFor(() => expect(cambiarPasswordConActual).toHaveBeenCalled())
    expect(localStorage.getItem('talento.sesion')).toBeNull()
  })
})
describe('CambioPasswordCuenta — resultado', () => {
  it('muestra el mensaje de éxito del backend y limpia el formulario', async () => {
    vi.mocked(cambiarPasswordConActual).mockResolvedValue({
      mensaje: MENSAJE_OK,
    })
    renderizar()
    completar()

    enviar()

    expect(await screen.findByRole('status')).toHaveTextContent(MENSAJE_OK)
    expect(screen.getByLabelText('Contraseña actual')).toHaveValue('')
    expect(screen.getByLabelText('Nueva contraseña')).toHaveValue('')
    expect(
      screen.getByLabelText('Confirma la nueva contraseña'),
    ).toHaveValue('')
  })

  it('un 400 muestra el mensaje del backend sin detalle técnico', async () => {
    vi.mocked(cambiarPasswordConActual).mockRejectedValue(
      Object.assign(new Error('La contraseña actual es incorrecta.'), {
        estado: 400,
      }),
    )
    const { alCambiar } = renderizar()
    completar()

    enviar()

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('La contraseña actual es incorrecta.')
    expect(alerta).not.toHaveTextContent('Traceback')
    expect(alCambiar).not.toHaveBeenCalled()
  })

  it('un 422 muestra un mensaje de política legible', async () => {
    vi.mocked(cambiarPasswordConActual).mockRejectedValue(
      Object.assign(new Error('Value error, la contraseña es demasiado corta'), {
        estado: 422,
      }),
    )
    renderizar()
    completar()

    enviar()

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('no cumple los requisitos indicados')
    expect(alerta).not.toHaveTextContent('Value error')
  })

  it('un 401 delega en alSesionExpirada sin mostrar estado de error', async () => {
    vi.mocked(cambiarPasswordConActual).mockRejectedValue(
      Object.assign(new Error('Credenciales inválidas.'), { estado: 401 }),
    )
    const { alSesionExpirada } = renderizar()
    completar()

    enviar()

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('un fallo de conexión se muestra legible', async () => {
    vi.mocked(cambiarPasswordConActual).mockRejectedValue(
      Object.assign(
        new Error(
          'No fue posible conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.',
        ),
        { estado: 0 },
      ),
    )
    renderizar()
    completar()

    enviar()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No fue posible conectar con el servidor',
    )
  })

  it('tras un error permite corregir y reintentar', async () => {
    vi.mocked(cambiarPasswordConActual)
      .mockRejectedValueOnce(
        Object.assign(new Error('La contraseña actual es incorrecta.'), {
          estado: 400,
        }),
      )
      .mockResolvedValueOnce({ mensaje: MENSAJE_OK })
    renderizar()
    completar()

    enviar()
    await screen.findByRole('alert')

    escribir({ actual: 'corregida1' })
    enviar()

    expect(await screen.findByRole('status')).toHaveTextContent(MENSAJE_OK)
    expect(cambiarPasswordConActual).toHaveBeenCalledTimes(2)
  })
})