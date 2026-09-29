// Contrato del historial de evaluaciones por empleado (PRD §20.2 Perfil
// individual; ET §31/§34 — GET /api/v1/rh/employees/{id}/evaluations).
// El cliente HTTP se mockea: sin llamadas reales al backend.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { solicitar } from '../clienteApi.js'
import {
  listarEvaluacionesEmpleado,
  POR_PAGINA_DEFECTO,
} from '../evaluaciones.js'

vi.mock('../clienteApi.js', () => ({ solicitar: vi.fn() }))

const PAGINA = {
  total: 2,
  pagina: 1,
  por_pagina: 1,
  items: [
    {
      id: 11,
      empleado_id: 7,
      periodo: '2026-Q3',
      competencias: [
        { clave: 'liderazgo', nivel: 3, status: 'CALCULABLE' },
        { clave: 'aprendizaje', nivel: null, status: 'INSUFFICIENT_DATA' },
      ],
      generado_en: '2026-09-20T14:32:10.123456+00:00',
      generado_por_cuenta_id: 4,
      nine_box: {
        performance_axis: 3.2,
        potential_axis: 4.1,
        box_code: 'B6',
        etiqueta_performance: 'Fuerte',
        etiqueta_potencial: 'Alto',
      },
    },
  ],
}

/** Ruta llamada en la última petición al cliente HTTP. */
function rutaDeLaUltimaLlamada() {
  return vi.mocked(solicitar).mock.calls.at(-1)[0]
}

/** Query params de la última llamada como URLSearchParams. */
function consultaDeLaUltimaLlamada() {
  return new URLSearchParams(rutaDeLaUltimaLlamada().split('?')[1])
}

beforeEach(() => {
  vi.mocked(solicitar).mockReset()
  vi.mocked(solicitar).mockResolvedValue(PAGINA)
})

describe('evaluaciones — historial por empleado (RH)', () => {
  it('construye la URL del empleado con pagina=1 y por_pagina=1 y envía el token', async () => {
    await listarEvaluacionesEmpleado('token-rh', 7, { pagina: 1, porPagina: 1 })

    expect(solicitar).toHaveBeenCalledTimes(1)
    const [ruta, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(ruta).toContain('/api/v1/rh/employees/7/evaluations?')
    expect(consultaDeLaUltimaLlamada().get('pagina')).toBe('1')
    expect(consultaDeLaUltimaLlamada().get('por_pagina')).toBe('1')
    expect(opciones).toEqual({ token: 'token-rh' })
    expect(opciones.metodo).toBeUndefined()
  })

  it('aplica la paginación por defecto del contrato (1 y 20)', async () => {
    await listarEvaluacionesEmpleado('token-rh', 7)

    expect(consultaDeLaUltimaLlamada().get('pagina')).toBe('1')
    expect(consultaDeLaUltimaLlamada().get('por_pagina')).toBe(String(POR_PAGINA_DEFECTO))
  })

  it('respeta el tope de por_pagina del backend (100)', async () => {
    await listarEvaluacionesEmpleado('token-rh', 7, { pagina: 1, porPagina: 500 })

    expect(consultaDeLaUltimaLlamada().get('por_pagina')).toBe('100')
  })

  it('codifica el empleadoId en la ruta', async () => {
    await listarEvaluacionesEmpleado('token-rh', 'a b')

    expect(rutaDeLaUltimaLlamada()).toContain('/api/v1/rh/employees/a%20b/evaluations')
  })

  it('devuelve el EvaluacionPageOut del backend sin transformarlo', async () => {
    await expect(
      listarEvaluacionesEmpleado('token-rh', 7, { pagina: 1, porPagina: 1 }),
    ).resolves.toEqual(PAGINA)
  })

  it('propaga el 401 con su estado HTTP', async () => {
    const error = Object.assign(new Error('no autorizado'), { estado: 401 })
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(
      listarEvaluacionesEmpleado('token-rh', 7, { pagina: 1, porPagina: 1 }),
    ).rejects.toBe(error)
  })

  it('propaga el 404 de empleado inexistente', async () => {
    const error = Object.assign(new Error('empleado no encontrado'), { estado: 404 })
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(listarEvaluacionesEmpleado('token-rh', 999)).rejects.toBe(error)
  })

  it('propaga un 500 para que la vista muestre su estado de error', async () => {
    const error = Object.assign(new Error('fallo del servidor'), { estado: 500 })
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(listarEvaluacionesEmpleado('token-rh', 7)).rejects.toBe(error)
  })
})
