// Cambio voluntario de contraseña desde "Mi cuenta" (PRD §21.6): cuenta con
// contraseña definitiva, donde el backend EXIGE `password_actual`. La API se
// mockea: sin llamadas reales al backend.
//
// No se toca `CambioContrasena.test.jsx`: ese archivo cubre el onboarding de
// primer acceso, que es un flujo distinto y ya cerrado.
//
// Rediseño v6: además de los flujos reales, este archivo cubre el ojo por
// campo, los indicadores vivos de requisitos y el botón condicionado. Los
// envíos con datos incompletos se prueban por submit directo (capa de
// validación en JS) y los errores del servidor (400/422/401/conexión)
// conservan sus comprobaciones.

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
    expect(screen.getByText('Mínimo 8 caracteres')).toBeInTheDocument()
    expect(screen.getByText('Al menos un número')).toBeInTheDocument()
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
    await waitFor(() => expect(cambiarPasswordConActual).toHaveBeenCalledTimes(1))
    // Tras el éxito se limpian los campos: con el botón condicionado a los
    // datos completos (boceto v6), vuelve a estar deshabilitado hasta rellenar
    // el formulario de nuevo.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Cambiar contraseña' }),
      ).toBeDisabled(),
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

describe('CambioPasswordCuenta — visibilidad, requisitos y botón (boceto v6)', () => {
  /** Ojo de un campo concreto, localizado por su input etiquetado. */
  function ojoDe(etiqueta) {
    const campo = screen
      .getByLabelText(etiqueta)
      .closest('.cuenta-password__campo')
    return campo.querySelector('button.cuenta-password__ojo')
  }

  function tipoDe(etiqueta) {
    return screen.getByLabelText(etiqueta).getAttribute('type')
  }

  it('ofrece un ojo accesible por campo que alterna solo su contraseña', () => {
    renderizar()

    for (const etiqueta of [
      'Contraseña actual',
      'Nueva contraseña',
      'Confirma la nueva contraseña',
    ]) {
      const ojo = ojoDe(etiqueta)
      expect(ojo).toHaveAttribute('aria-label', 'Mostrar u ocultar contraseña')
      expect(ojo).toHaveAttribute('aria-pressed', 'false')
      expect(ojo).toHaveAttribute('type', 'button')
      expect(tipoDe(etiqueta)).toBe('password')
    }

    // Alterna SOLO el campo correspondiente y se puede volver a ocultar.
    fireEvent.click(ojoDe('Nueva contraseña'))
    expect(tipoDe('Nueva contraseña')).toBe('text')
    expect(tipoDe('Contraseña actual')).toBe('password')
    expect(tipoDe('Confirma la nueva contraseña')).toBe('password')
    expect(ojoDe('Nueva contraseña')).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(ojoDe('Nueva contraseña'))
    expect(tipoDe('Nueva contraseña')).toBe('password')
  })

  it('mostrar u ocultar conserva el valor escrito del campo', () => {
    renderizar()
    escribir({ nueva: 'secreta1234' })

    fireEvent.click(ojoDe('Nueva contraseña'))

    expect(tipoDe('Nueva contraseña')).toBe('text')
    expect(screen.getByLabelText('Nueva contraseña')).toHaveValue('secreta1234')
  })

  it('los indicadores de requisitos se actualizan al escribir', () => {
    renderizar()

    const indicador = (texto) =>
      screen.getByText(texto).closest('.cuenta-password__req')
    // Inicial: gris, sin marca de cumplimiento.
    expect(indicador('Mínimo 8 caracteres').className).not.toContain('--ok')
    expect(indicador('Al menos un número').className).not.toContain('--ok')

    // 7 caracteres sin número: ninguno cumple todavía.
    escribir({ nueva: 'abcdefg' })
    expect(indicador('Mínimo 8 caracteres').className).not.toContain('--ok')
    expect(indicador('Al menos un número').className).not.toContain('--ok')

    // 8+ caracteres sin número: solo el primer requisito.
    escribir({ nueva: 'abcdefgh' })
    expect(indicador('Mínimo 8 caracteres').className).toContain(
      'cuenta-password__req--ok',
    )
    expect(indicador('Al menos un número').className).not.toContain('--ok')

    // Con número: los dos cumplidos, sin tocar la API.
    escribir({ nueva: 'abcdefgh1' })
    expect(indicador('Mínimo 8 caracteres').className).toContain(
      'cuenta-password__req--ok',
    )
    expect(indicador('Al menos un número').className).toContain(
      'cuenta-password__req--ok',
    )
    expect(cambiarPasswordConActual).not.toHaveBeenCalled()
  })

  it('el botón permanece deshabilitado hasta cumplir las cuatro condiciones', () => {
    renderizar()
    const boton = () => screen.getByRole('button', { name: 'Cambiar contraseña' })

    // Vacío → deshabilitado.
    expect(boton()).toBeDisabled()

    // Sin contraseña actual → deshabilitado.
    escribir({ nueva: 'nueva1234', repetir: 'nueva1234' })
    expect(boton()).toBeDisabled()

    // Nueva demasiado corta → deshabilitado.
    escribir({ actual: 'actual123', nueva: 'nueva1', repetir: 'nueva1' })
    expect(boton()).toBeDisabled()

    // Nueva sin número → deshabilitado (aunque coincidan).
    escribir({ actual: 'actual123', nueva: 'nuevaletras', repetir: 'nuevaletras' })
    expect(boton()).toBeDisabled()

    // Confirmación que no coincide → deshabilitado.
    escribir({ actual: 'actual123', nueva: 'nueva1234', repetir: 'otra1234' })
    expect(boton()).toBeDisabled()

    // Las cuatro cumplidas → habilitado.
    escribir({ actual: 'actual123', nueva: 'nueva1234', repetir: 'nueva1234' })
    expect(boton()).toBeEnabled()
  })

  it('estando deshabilitado no se envía nada al backend', () => {
    renderizar()
    escribir({ actual: 'actual123', nueva: 'nueva1234', repetir: 'otra1234' })

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))

    expect(cambiarPasswordConActual).not.toHaveBeenCalled()
  })

  it('muestra el mensaje de éxito REAL del backend junto al botón', async () => {
    vi.mocked(cambiarPasswordConActual).mockResolvedValue({
      mensaje: 'Tu contraseña se actualizó correctamente.',
    })
    renderizar()
    completar()

    enviar()

    const exito = await screen.findByRole('status')
    expect(exito).toHaveTextContent('Tu contraseña se actualizó correctamente.')
    expect(exito.className).toContain('cuenta-password__ok')
    // Los campos quedan limpios y el botón vuelve a estar deshabilitado.
    expect(screen.getByLabelText('Contraseña actual')).toHaveValue('')
    expect(
      screen.getByRole('button', { name: 'Cambiar contraseña' }),
    ).toBeDisabled()
  })
})