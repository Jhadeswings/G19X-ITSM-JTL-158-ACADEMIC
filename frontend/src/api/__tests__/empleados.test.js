// Contrato del alta de empleado por RH (PRD §3.3; Especificación Técnica §31).
// El cliente HTTP se mockea: sin llamadas reales al backend.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { solicitar } from '../clienteApi.js'
import { crearEmpleado } from '../empleados.js'

vi.mock('../clienteApi.js', () => ({ solicitar: vi.fn() }))

const DATOS = {
  nombre: 'Empleado Nuevo',
  email: 'nuevo@empresa.dev',
  puesto: 'Desarrollador',
  area: 'TI',
  fecha_ingreso: '2026-01-15',
}

beforeEach(() => {
  vi.mocked(solicitar).mockReset()
})

describe('empleados — alta por RH', () => {
  it('llama a POST /api/v1/rh/employees con el token de la sesión', async () => {
    vi.mocked(solicitar).mockResolvedValue({ id: 1 })

    await crearEmpleado('token-rh', DATOS)

    expect(solicitar).toHaveBeenCalledWith('/api/v1/rh/employees', {
      metodo: 'POST',
      token: 'token-rh',
      cuerpo: DATOS,
    })
  })

  it('devuelve la respuesta del backend sin transformarla', async () => {
    const respuesta = {
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
    vi.mocked(solicitar).mockResolvedValue(respuesta)

    await expect(crearEmpleado('token-rh', DATOS)).resolves.toEqual(respuesta)
  })

  it('propaga los errores de la capa existente (ErrorApi)', async () => {
    const error = Object.assign(new Error('conflicto'), { estado: 409 })
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(crearEmpleado('token-rh', DATOS)).rejects.toBe(error)
  })
})