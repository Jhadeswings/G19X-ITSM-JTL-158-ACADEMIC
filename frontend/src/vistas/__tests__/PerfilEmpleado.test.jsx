// Perfil individual RH: información básica (PRD §20.1; Style Guide §6, §7).
// La API se mockea: sin llamadas reales al backend.
//
// Qué se verifica aquí:
// - estado de carga;
// - información básica del EmpleadoOut, sin resultados ni competencias;
// - apertura desde una fila con una sola consulta;
// - volver al listado sin recargar el catálogo;
// - 404 neutral con volver; 401 delegando en `alSesionExpirada`.

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listarEmpleados, obtenerEmpleado, POR_PAGINA_DEFECTO } from '../../api/empleados.js'
import Empleados from '../Empleados.jsx'
import PerfilEmpleado from '../PerfilEmpleado.jsx'

vi.mock('../../api/empleados.js', async () => {
  const original = await vi.importActual('../../api/empleados.js')
  return {
    ...original,
    listarEmpleados: vi.fn(),
    crearEmpleado: vi.fn(),
    obtenerEmpleado: vi.fn(),
  }
})

const EMPLEADOS = [
  { id: 1, nombre: 'Ana López', puesto: 'Analista de datos', area: 'TI', activo: true },
  { id: 2, nombre: 'Luis Pérez', puesto: 'Desarrollador', area: null, activo: false },
]

function pagina(items) {
  return { total: items.length, pagina: 1, por_pagina: POR_PAGINA_DEFECTO, items }
}

const DETALLE = {
  id: 1,
  nombre: 'Ana López',
  puesto: 'Analista de datos',
  area: 'TI',
  fecha_ingreso: '2024-03-01',
  activo: true,
  cuenta: {
    email: 'ana@empresa.dev',
    rol: 'EMPLEADO',
    activo: true,
    must_change_password: false,
  },
}

beforeEach(() => {
  vi.mocked(listarEmpleados).mockReset()
  vi.mocked(obtenerEmpleado).mockReset()
  vi.mocked(listarEmpleados).mockResolvedValue(pagina(EMPLEADOS))
  vi.mocked(obtenerEmpleado).mockResolvedValue(DETALLE)
})

describe('PerfilEmpleado — información básica', () => {
  it('muestra un estado de carga antes de resolver la consulta', () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(screen.getByText('Cargando información del empleado…')).toBeInTheDocument()
  })

  it('muestra la información básica del empleado', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(await screen.findByText('Información básica')).toBeInTheDocument()
    expect(screen.getByText('ana@empresa.dev')).toBeInTheDocument()
    expect(screen.getByText('EMPLEADO')).toBeInTheDocument()
    expect(screen.getByText('2024-03-01')).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
  })

  it('no adelanta competencias, resultados ni evaluaciones', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await screen.findByText('Información básica')

    expect(screen.queryByText(/competencia/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/9-Box/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/evaluaci/i)).not.toBeInTheDocument()
  })

  it('muestra un estado neutral ante un 404 con opción de volver', async () => {
    const alVolver = vi.fn()
    vi.mocked(obtenerEmpleado).mockRejectedValueOnce(
      Object.assign(new Error('no encontrado'), { estado: 404 }),
    )
    render(
      <PerfilEmpleado token="token-rh" empleadoId={999} alVolver={alVolver} />,
    )

    expect(
      await screen.findByText('Este empleado no está disponible.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('No pudimos cargar la información del empleado'),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Volver al listado' })[0])
    expect(alVolver).toHaveBeenCalledTimes(1)
  })

  it('cierra la sesión ante un 401 sin mostrar un estado de error', async () => {
    const alSesionExpirada = vi.fn()
    vi.mocked(obtenerEmpleado).mockRejectedValue(
      Object.assign(new Error('Credenciales inválidas.'), { estado: 401 }),
    )
    render(
      <PerfilEmpleado
        token="token-rh"
        empleadoId={1}
        alVolver={() => {}}
        alSesionExpirada={alSesionExpirada}
      />,
    )

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(
      screen.queryByText('No pudimos cargar la información del empleado'),
    ).not.toBeInTheDocument()
  })
})

describe('Empleados — acceso al perfil individual', () => {
  it('abre el perfil desde una fila con una sola consulta', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.click(screen.getByRole('button', { name: 'Ana López' }))

    await screen.findByText('Información básica')
    await waitFor(() => expect(obtenerEmpleado).toHaveBeenCalledTimes(1))
    expect(vi.mocked(obtenerEmpleado).mock.calls[0]).toEqual(['token-rh', 1])
    expect(screen.getByText('ana@empresa.dev')).toBeInTheDocument()
  })

  it('vuelve al listado sin recargar el catálogo', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')
    const llamadasListado = vi.mocked(listarEmpleados).mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Ana López' }))
    await screen.findByText('Información básica')

    fireEvent.click(screen.getAllByRole('button', { name: 'Volver al listado' })[0])

    expect(await screen.findByText('Ana López')).toBeInTheDocument()
    expect(screen.queryByText('Información básica')).not.toBeInTheDocument()
    expect(vi.mocked(listarEmpleados).mock.calls).toHaveLength(llamadasListado)
  })
})
