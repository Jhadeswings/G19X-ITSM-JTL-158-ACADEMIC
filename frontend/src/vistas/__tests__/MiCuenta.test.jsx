// Mi cuenta (Empleado, PRD §21.6): los cuatro datos que el PRD exige y el
// formulario de cambio de contraseña como bloque independiente. `api/cuenta.js`
// y `api/autenticacion.js` se mockean: sin llamadas reales al backend.

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cambiarPasswordConActual } from '../../api/autenticacion.js'
import { obtenerCuenta } from '../../api/cuenta.js'
import MiCuenta from '../MiCuenta.jsx'

vi.mock('../../api/cuenta.js', () => ({ obtenerCuenta: vi.fn() }))
vi.mock('../../api/autenticacion.js', () => ({
  cambiarPasswordConActual: vi.fn(),
}))

// Contrato real de `GET /api/v1/me` (MeOut, MB-6-1), incluido lo que la vista
// NO debe mostrar.
const CUENTA = {
  cuenta_id: 4,
  email: 'ana@empresa.dev',
  rol: 'EMPLEADO',
  empleado_id: 7,
  empleado_nombre: 'Ana López',
  puesto: 'Analista de Datos',
  area: 'Tecnología',
  must_change_password: false,
}

function errorCon(estado, mensaje) {
  return Object.assign(new Error(mensaje), { estado })
}

function renderizar(props = {}) {
  const alSesionExpirada = vi.fn()
  render(
    <MiCuenta token="token-1" alSesionExpirada={alSesionExpirada} {...props} />,
  )
  return { alSesionExpirada }
}

/** Devuelve los valores de las filas de datos en orden de definición. */
function valoresDeDatos(container) {
  return [
    ...container.querySelectorAll('.cuenta-datos__lista > div'),
  ].map((fila) => fila.querySelector('dd')?.textContent)
}

beforeEach(() => {
  vi.mocked(obtenerCuenta).mockReset()
  vi.mocked(cambiarPasswordConActual).mockReset()
  localStorage.clear()
  vi.mocked(obtenerCuenta).mockResolvedValue(CUENTA)
})

describe('MiCuenta — carga', () => {
  it('muestra el estado de carga antes de resolver', () => {
    vi.mocked(obtenerCuenta).mockReturnValue(new Promise(() => {}))
    renderizar()

    expect(screen.getByText('Cargando tu información…')).toBeInTheDocument()
  })

  it('una respuesta muy rápida mantiene el loading visible el mínimo perceptible', async () => {
    const inicio = Date.now()
    renderizar()

    expect(screen.getByText('Cargando tu información…')).toBeInTheDocument()
    await screen.findByRole('heading', { name: 'Información de la cuenta' })
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(350)
  })

  it('un error de carga no espera el mínimo', async () => {
    vi.mocked(obtenerCuenta).mockRejectedValueOnce(errorCon(500, 'Fallo'))
    const inicio = Date.now()
    renderizar()

    expect(
      await screen.findByText('No pudimos cargar esta información.'),
    ).toBeInTheDocument()
    expect(Date.now() - inicio).toBeLessThan(400)
  })

  it('consulta /me con el token y sin empleado_id', async () => {
    renderizar()

    await waitFor(() => expect(obtenerCuenta).toHaveBeenCalledTimes(1))
    // Transporte puro: la identidad la deriva el backend del token (§32).
    expect(obtenerCuenta).toHaveBeenCalledWith('token-1')
    expect(obtenerCuenta.mock.calls[0]).toHaveLength(1)
  })
})

describe('MiCuenta — datos', () => {
  it('muestra nombre, puesto, área y correo de acceso (§21.6)', async () => {
    renderizar()

    expect(
      await screen.findByRole('heading', { name: 'Información de la cuenta' }),
    ).toBeInTheDocument()
    expect(valoresDeDatos(document.body)).toEqual([
      'Ana López',
      'Analista de Datos',
      'Tecnología',
      'ana@empresa.dev',
    ])
  })

  it('asocia cada dato a su etiqueta', async () => {
    renderizar()
    await screen.findByRole('heading', { name: 'Información de la cuenta' })

    const fila = (etiqueta) =>
      screen.getByText(etiqueta).closest('.cuenta-datos__lista > div')

    expect(fila('Nombre')?.querySelector('dd')?.textContent).toBe('Ana López')
    expect(fila('Puesto')?.querySelector('dd')?.textContent).toBe(
      'Analista de Datos',
    )
    expect(fila('Área')?.querySelector('dd')?.textContent).toBe('Tecnología')
    expect(fila('Correo de acceso')?.querySelector('dd')?.textContent).toBe(
      'ana@empresa.dev',
    )
  })

  it('NO muestra campos internos ni datos fuera de §21.6', async () => {
    renderizar()
    await screen.findByRole('heading', { name: 'Información de la cuenta' })

    const texto = document.body.textContent
    // Identificadores, rol y estado de credencial: no se pintan.
    expect(texto).not.toContain('must_change_password')
    expect(texto).not.toContain('EMPLEADO')
    expect(texto).not.toContain('Rol')
    expect(texto).not.toContain('Fecha de ingreso')
    expect(texto).not.toContain('Antigüedad')
    // Ningún identificador interno se presenta como dato.
    expect(screen.queryByText(String(CUENTA.cuenta_id))).not.toBeInTheDocument()
    expect(screen.queryByText(String(CUENTA.empleado_id))).not.toBeInTheDocument()
  })

  it('no ofrece ninguna edición de los datos laborales', async () => {
    renderizar()
    await screen.findByRole('heading', { name: 'Información de la cuenta' })

    // PRD §21.6: "No permite modificar datos laborales". Son texto, no inputs,
    // y no hay ningún control de edición ni de guardado.
    for (const etiqueta of ['Nombre', 'Puesto', 'Área', 'Correo de acceso']) {
      const fila = screen.getByText(etiqueta).closest('div')
      expect(fila?.querySelector('input')).toBeNull()
      expect(fila?.querySelector('button')).toBeNull()
    }
    expect(
      screen.queryByRole('button', { name: /Editar|Guardar datos|Actualizar/ }),
    ).not.toBeInTheDocument()
  })
})
describe('MiCuenta — datos nulos', () => {
  it('puesto y área nulos se presentan neutros sin inventar copy', async () => {
    vi.mocked(obtenerCuenta).mockResolvedValue({
      ...CUENTA,
      puesto: null,
      area: null,
    })
    const { container } = renderizar()

    await screen.findByRole('heading', { name: 'Información de la cuenta' })

    // `SIN_DATO` es el texto neutro que el sistema ya emplea para datos
    // ausentes (`PerfilEmpleado` lo aplica a estos mismos campos). No se
    // inventa copy de negocio ni se crea una regla de "perfil incompleto".
    expect(valoresDeDatos(container ?? document.body)).toEqual([
      'Ana López',
      '—',
      '—',
      'ana@empresa.dev',
    ])
    expect(document.body.textContent).not.toMatch(
      /Sin puesto|No asignado|Pendiente|No disponible/,
    )
  })

  it('un solo campo nulo no oculta el otro', async () => {
    vi.mocked(obtenerCuenta).mockResolvedValue({
      ...CUENTA,
      puesto: null,
      area: 'Operaciones',
    })
    const { container } = renderizar()

    await screen.findByRole('heading', { name: 'Información de la cuenta' })

    expect(valoresDeDatos(container ?? document.body)).toEqual([
      'Ana López',
      '—',
      'Operaciones',
      'ana@empresa.dev',
    ])
  })
})

describe('MiCuenta — errores de carga', () => {
  it('muestra el estado de error del Style Guide §28 sin detalle técnico', async () => {
    vi.mocked(obtenerCuenta).mockRejectedValue(
      errorCon(500, 'Error interno del servidor'),
    )
    renderizar()

    expect(
      await screen.findByRole('heading', {
        name: 'No pudimos cargar esta información.',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).not.toHaveTextContent('Traceback')
    expect(screen.getByRole('alert')).not.toHaveTextContent('SELECT')
  })

  it('el reintento vuelve a consultar y recupera', async () => {
    vi.mocked(obtenerCuenta)
      .mockRejectedValueOnce(errorCon(500, 'Error interno del servidor'))
      .mockResolvedValueOnce(CUENTA)
    renderizar()

    await screen.findByRole('button', { name: 'Intentar de nuevo' })
    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    expect(
      await screen.findByRole('heading', { name: 'Información de la cuenta' }),
    ).toBeInTheDocument()
    expect(obtenerCuenta).toHaveBeenCalledTimes(2)
  })

  it('un 401 delega en alSesionExpirada sin mostrar estado de error', async () => {
    vi.mocked(obtenerCuenta).mockRejectedValue(
      errorCon(401, 'Credenciales inválidas.'),
    )
    const { alSesionExpirada } = renderizar()

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('si /me falla no presenta datos ni el formulario como cargados', async () => {
    vi.mocked(obtenerCuenta).mockRejectedValue(errorCon(500, 'Fallo'))
    renderizar()

    await screen.findByRole('button', { name: 'Intentar de nuevo' })
    expect(
      screen.queryByRole('heading', { name: 'Información de la cuenta' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Cambiar contraseña' }),
    ).not.toBeInTheDocument()
  })
})
describe('MiCuenta — cambio de contraseña', () => {
  async function montar() {
    const resultado = renderizar()
    await screen.findByRole('heading', { name: 'Información de la cuenta' })
    return resultado
  }

  function llenarFormulario() {
    fireEvent.change(screen.getByLabelText('Contraseña actual'), {
      target: { value: 'actual123' },
    })
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), {
      target: { value: 'nueva1234' },
    })
    fireEvent.change(screen.getByLabelText('Confirma la nueva contraseña'), {
      target: { value: 'nueva1234' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
  }

  it('integra el formulario de cambio de contraseña', async () => {
    await montar()

    expect(
      screen.getByRole('heading', { name: 'Cambiar contraseña' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña actual')).toBeInTheDocument()
    expect(screen.getByLabelText('Nueva contraseña')).toBeInTheDocument()
    expect(
      screen.getByLabelText('Confirma la nueva contraseña'),
    ).toBeInTheDocument()
  })

  it('un cambio exitoso confirma sin tocar los datos de cuenta', async () => {
    vi.mocked(cambiarPasswordConActual).mockResolvedValue({
      mensaje: 'Contraseña actualizada.',
    })
    await montar()

    llenarFormulario()

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Contraseña actualizada.',
    )
    // Los datos de cuenta siguen visibles e intactos.
    expect(valoresDeDatos(document.body)).toEqual([
      'Ana López',
      'Analista de Datos',
      'Tecnología',
      'ana@empresa.dev',
    ])
  })

  it('un fallo al cambiar la contraseña NO borra los datos ya cargados', async () => {
    vi.mocked(cambiarPasswordConActual).mockRejectedValue(
      errorCon(400, 'La contraseña actual es incorrecta.'),
    )
    await montar()

    llenarFormulario()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La contraseña actual es incorrecta.',
    )
    // Estados independientes: la consulta de cuenta sigue en "listo".
    expect(valoresDeDatos(document.body)).toEqual([
      'Ana López',
      'Analista de Datos',
      'Tecnología',
      'ana@empresa.dev',
    ])
    expect(obtenerCuenta).toHaveBeenCalledTimes(1)
  })

  it('un 401 al cambiar la contraseña delega en alSesionExpirada', async () => {
    vi.mocked(cambiarPasswordConActual).mockRejectedValue(
      errorCon(401, 'Credenciales inválidas.'),
    )
    const { alSesionExpirada } = await montar()

    llenarFormulario()

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
  })

  it('la vista no modifica la sesión ni mustChangePassword', async () => {
    vi.mocked(cambiarPasswordConActual).mockResolvedValue({
      mensaje: 'Contraseña actualizada.',
    })
    localStorage.setItem(
      'talento.sesion',
      JSON.stringify({
        token: 'token-1',
        rol: 'EMPLEADO',
        mustChangePassword: false,
      }),
    )
    await montar()

    expect(localStorage.getItem('talento.sesion')).toEqual(
      JSON.stringify({
        token: 'token-1',
        rol: 'EMPLEADO',
        mustChangePassword: false,
      }),
    )
  })
})