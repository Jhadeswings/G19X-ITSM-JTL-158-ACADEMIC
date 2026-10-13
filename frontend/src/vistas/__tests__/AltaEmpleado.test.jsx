// Vista "Alta de empleado" del rol RH (PRD §3.3; Style Guide §21/§22).
// La API se mockea: sin llamadas reales al backend.

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearEmpleado } from '../../api/empleados.js'
import AltaEmpleado from '../AltaEmpleado.jsx'

vi.mock('../../api/empleados.js', () => ({ crearEmpleado: vi.fn() }))

const CREADO = {
  id: 7,
  nombre: 'Empleado Nuevo',
  puesto: 'Desarrollador',
  area: 'TI',
  fecha_ingreso: '2026-01-15',
  activo: true,
  cuenta: {
    email: 'nuevo@empresa.dev',
    rol: 'EMPLEADO',
    activo: true,
    must_change_password: true,
  },
}

function llenarFormulario({
  nombre = 'Empleado Nuevo',
  email = 'nuevo@empresa.dev',
  puesto = 'Desarrollador',
  area = 'TI',
  fecha = '2026-01-15',
} = {}) {
  fireEvent.change(screen.getByLabelText('Nombre'), {
    target: { value: nombre },
  })
  fireEvent.change(screen.getByLabelText('Correo de acceso'), {
    target: { value: email },
  })
  fireEvent.change(screen.getByLabelText('Puesto'), {
    target: { value: puesto },
  })
  fireEvent.change(screen.getByLabelText('Área'), { target: { value: area } })
  fireEvent.change(screen.getByLabelText('Fecha de ingreso'), {
    target: { value: fecha },
  })
}

function enviar() {
  fireEvent.click(screen.getByRole('button', { name: 'Crear empleado' }))
}

function errorDe(estado, mensaje = 'detalle') {
  return Object.assign(new Error(mensaje), { estado })
}

beforeEach(() => {
  vi.mocked(crearEmpleado).mockReset()
})

describe('AltaEmpleado — formulario', () => {
  it('renderiza los cinco campos del PRD §3.3 con etiquetas explícitas', () => {
    render(<AltaEmpleado token="token-rh" alSesionExpirada={vi.fn()} />)

    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()
    expect(screen.getByLabelText('Correo de acceso')).toBeInTheDocument()
    expect(screen.getByLabelText('Puesto')).toBeInTheDocument()
    expect(screen.getByLabelText('Área')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha de ingreso')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Crear empleado' }),
    ).toBeInTheDocument()
    // El formulario vive en página, no en modal (Style Guide §21).
    expect(screen.getByRole('form')).toBeInTheDocument()
  })

  it('separa el aviso informativo del formulario sin cambiar su contenido', () => {
    render(<AltaEmpleado token="token-rh" alSesionExpirada={vi.fn()} />)

    const aviso = screen.getByText(/creará también la cuenta de acceso/)
    const formulario = screen.getByRole('form')

    // El aviso es un bloque propio ANTES del formulario, no una región de él:
    // así el espaciado entre ambos lo controla el CSS, no el relleno interno.
    expect(formulario).not.toContainElement(aviso)
    expect(aviso.compareDocumentPosition(formulario) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Texto intacto.
    expect(aviso).toHaveTextContent(
      'El sistema creará también la cuenta de acceso con una credencial temporal para el primer acceso. Los datos laborales marcados como opcionales pueden completarse ahora o posteriormente.',
    )
  })

  it('mantiene la asociación accesible entre el correo y el aviso', () => {
    render(<AltaEmpleado token="token-rh" alSesionExpirada={vi.fn()} />)

    const correo = screen.getByLabelText('Correo de acceso')
    const ayuda = document.getElementById('ayuda-alta')

    expect(correo).toHaveAttribute('aria-describedby', 'ayuda-alta')
    expect(ayuda).toHaveTextContent(/credencial temporal/)
  })

  it('envía el payload del contrato actual con el token de la sesión', async () => {
    vi.mocked(crearEmpleado).mockResolvedValue(CREADO)
    const alSesionExpirada = vi.fn()
    render(
      <AltaEmpleado token="token-rh" alSesionExpirada={alSesionExpirada} />,
    )

    llenarFormulario()
    enviar()

    await waitFor(() =>
      expect(crearEmpleado).toHaveBeenCalledWith('token-rh', {
        nombre: 'Empleado Nuevo',
        email: 'nuevo@empresa.dev',
        puesto: 'Desarrollador',
        area: 'TI',
        fecha_ingreso: '2026-01-15',
      }),
    )
    expect(alSesionExpirada).not.toHaveBeenCalled()
  })

  it('los opcionales vacíos se envían como null, no como string vacío', async () => {
    vi.mocked(crearEmpleado).mockResolvedValue(CREADO)
    render(<AltaEmpleado token="token-rh" alSesionExpirada={vi.fn()} />)

    llenarFormulario({ puesto: '', area: '', fecha: '' })
    enviar()

    await waitFor(() =>
      expect(crearEmpleado).toHaveBeenCalledWith('token-rh', {
        nombre: 'Empleado Nuevo',
        email: 'nuevo@empresa.dev',
        puesto: null,
        area: null,
        fecha_ingreso: null,
      }),
    )
  })
})

describe('AltaEmpleado — estados', () => {
  it('muestra el estado de carga mientras se crea el empleado', async () => {
    vi.mocked(crearEmpleado).mockReturnValue(new Promise(() => {}))
    render(<AltaEmpleado token="token-rh" alSesionExpirada={vi.fn()} />)

    llenarFormulario()
    enviar()

    expect(await screen.findByText('Creando el empleado…')).toBeInTheDocument()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })

  it('muestra el alta exitosa con nombre, correo y aviso de primer acceso', async () => {
    vi.mocked(crearEmpleado).mockResolvedValue(CREADO)
    render(<AltaEmpleado token="token-rh" alSesionExpirada={vi.fn()} />)

    llenarFormulario()
    enviar()

    expect(await screen.findByText('Empleado creado')).toBeInTheDocument()
    expect(screen.getByText('Empleado Nuevo')).toBeInTheDocument()
    expect(screen.getByText('nuevo@empresa.dev')).toBeInTheDocument()
    expect(
      screen.getByText(/requiere cambio de contraseña en el primer acceso/),
    ).toBeInTheDocument()
    // Nunca se muestran credenciales ni hash (DECISIONES_TECNICAS §14).
    expect(screen.queryByText(/password_hash/i)).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Registrar otro empleado' }),
    ).toBeInTheDocument()
  })

  it('la nota operativa explica la entrega por correo y no menciona logs', async () => {
    vi.mocked(crearEmpleado).mockResolvedValue(CREADO)
    render(<AltaEmpleado token="token-rh" alSesionExpirada={vi.fn()} />)

    llenarFormulario()
    enviar()

    // PRD §3.3 y DECISIONES_TECNICAS §53: la credencial temporal se entrega
    // EXCLUSIVAMENTE por correo al correo de acceso de la persona; jamás se
    // registra en logs del backend (auditoría de secretos, §53).
    const nota = await screen.findByRole('status')
    expect(nota).toHaveTextContent(/no se muestra aquí/)
    expect(nota).toHaveTextContent(/envía al correo de acceso/)
    expect(nota).toHaveTextContent(CREADO.cuenta.email)
    expect(nota).not.toHaveTextContent(/log/i)
  })

  it('permite registrar otro empleado tras el éxito', async () => {
    vi.mocked(crearEmpleado).mockResolvedValue(CREADO)
    render(<AltaEmpleado token="token-rh" alSesionExpirada={vi.fn()} />)

    llenarFormulario()
    enviar()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Registrar otro empleado' }),
    )

    expect(screen.getByRole('form')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('')
    expect(screen.getByLabelText('Correo de acceso')).toHaveValue('')
  })
})

describe('AltaEmpleado — errores', () => {
  it('409: indica que el correo de acceso ya está registrado', async () => {
    vi.mocked(crearEmpleado).mockRejectedValue(errorDe(409))
    render(<AltaEmpleado token="token-rh" alSesionExpirada={vi.fn()} />)

    llenarFormulario()
    enviar()

    expect(await screen.findByText(/ya está registrado/)).toBeInTheDocument()
    // El formulario sigue disponible para corregir el correo.
    expect(screen.getByRole('form')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Empleado Nuevo')
  })

  it('422: indica que los datos enviados no son válidos', async () => {
    vi.mocked(crearEmpleado).mockRejectedValue(errorDe(422))
    render(<AltaEmpleado token="token-rh" alSesionExpirada={vi.fn()} />)

    llenarFormulario()
    enviar()

    expect(
      await screen.findByText(/datos enviados no son válidos/),
    ).toBeInTheDocument()
    expect(screen.getByRole('form')).toBeInTheDocument()
  })

  it('401: cierra la sesión con el patrón existente', async () => {
    vi.mocked(crearEmpleado).mockRejectedValue(
      errorDe(401, 'Credenciales inválidas.'),
    )
    const alSesionExpirada = vi.fn()
    render(<AltaEmpleado token="token-rh" alSesionExpirada={alSesionExpirada} />)

    llenarFormulario()
    enviar()

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/ya está registrado/)).not.toBeInTheDocument()
  })

  it('error genérico: usa EstadoError sin excepciones técnicas', async () => {
    vi.mocked(crearEmpleado).mockRejectedValue(errorDe(0, 'TypeError: red caída'))
    render(<AltaEmpleado token="token-rh" alSesionExpirada={vi.fn()} />)

    llenarFormulario()
    enviar()

    expect(
      await screen.findByRole('heading', {
        name: 'No pudimos crear el empleado',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/TypeError/)).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Intentar de nuevo' }),
    ).toBeInTheDocument()
  })

  it('el reintento del error genérico vuelve al formulario', async () => {
    vi.mocked(crearEmpleado)
      .mockRejectedValueOnce(errorDe(500))
      .mockResolvedValueOnce(CREADO)
    render(<AltaEmpleado token="token-rh" alSesionExpirada={vi.fn()} />)

    llenarFormulario()
    enviar()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Intentar de nuevo' }),
    )

    expect(screen.getByRole('form')).toBeInTheDocument()
    enviar()
    expect(await screen.findByText('Empleado creado')).toBeInTheDocument()
  })
})

