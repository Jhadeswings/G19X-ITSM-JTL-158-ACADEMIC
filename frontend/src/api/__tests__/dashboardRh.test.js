import { beforeEach, describe, expect, it, vi } from 'vitest'
import { solicitar } from '../clienteApi.js'
import { obtenerAtencionRequerida, obtenerEmpleadosActivos, obtenerProyectosActivos } from '../dashboardRh.js'

vi.mock('../clienteApi.js', () => ({ solicitar: vi.fn() }))

beforeEach(() => vi.mocked(solicitar).mockReset())

describe('Dashboard RH — clientes de datos', () => {
  it('consulta empleados activos con paginación mínima', async () => {
    vi.mocked(solicitar).mockResolvedValue({ total: 12, items: [] })
    await obtenerEmpleadosActivos('token-rh')
    expect(solicitar).toHaveBeenCalledWith('/api/v1/rh/employees?activo=true&por_pagina=1', { token: 'token-rh' })
  })

  it('consulta proyectos activos como EN_PROCESO', async () => {
    vi.mocked(solicitar).mockResolvedValue({ total: 4, items: [] })
    await obtenerProyectosActivos('token-rh')
    expect(solicitar).toHaveBeenCalledWith('/api/v1/rh/projects?estado=EN_PROCESO&por_pagina=1', { token: 'token-rh' })
  })

  it('consulta atención requerida sin paginación inventada', async () => {
    vi.mocked(solicitar).mockResolvedValue({ total: 1, items: [] })
    await obtenerAtencionRequerida('token-rh')
    expect(solicitar).toHaveBeenCalledWith('/api/v1/rh/attention-required', { token: 'token-rh' })
  })
})
