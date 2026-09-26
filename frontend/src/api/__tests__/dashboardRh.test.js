import { beforeEach, describe, expect, it, vi } from 'vitest'
import { solicitar } from '../clienteApi.js'
import { obtenerAtencionRequerida, obtenerDistribucionCompetencia, obtenerEmpleadosActivos, obtenerProyectosActivos } from '../dashboardRh.js'

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

  it('consulta la distribución de una sola competencia sin recalcular', async () => {
    vi.mocked(solicitar).mockResolvedValue({
      competency_code: 'liderazgo',
      evaluables: 2,
      datos_insuficientes: 1,
      nivel_1_2_count: 1,
      nivel_1_2_percentage: '50.00',
      nivel_3_5_count: 1,
      nivel_3_5_percentage: '50.00',
    })
    const respuesta = await obtenerDistribucionCompetencia('token-rh', 'liderazgo')
    expect(solicitar).toHaveBeenCalledWith('/api/v1/rh/gaps?competency_code=liderazgo', { token: 'token-rh' })
    expect(respuesta.nivel_1_2_percentage).toBe('50.00')
  })
})
