// Contrato del historial de evaluaciones por empleado (PRD §20.2 Perfil
// individual; ET §31/§34 — GET /api/v1/rh/employees/{id}/evaluations).
// El cliente HTTP se mockea: sin llamadas reales al backend.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { solicitar } from '../clienteApi.js'
import {
  listarEvaluacionesEmpleado,
  listarEvaluacionesPropias,
  POR_PAGINA_DEFECTO,
  POR_PAGINA_MAXIMO,
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

/**
 * Respuesta real de `EvaluacionEmpleadoPageOut`: el mismo historial que ve
 * RH pero SIN `nine_box` ni ejes (§21), que son exclusivos de RH (§10).
 * Cada evaluación conserva su snapshot histórico de las cinco competencias.
 */
const PAGINA_PROPIA = {
  total: 1,
  pagina: 1,
  por_pagina: 20,
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
    },
  ],
}

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

// ---------------------------------------------------------------------------
// MB-5D-1 — Historial propio del Empleado ("Mi historial", PRD §21.5).
//
// Solo TRANSPORTE: ruta exacta, GET con `{ token }`, paginación del contrato,
// respuesta sin transformar, propagación de errores y ausencia de cualquier
// método de modificación. Nada de presentación: las etiquetas de nivel, la
// evolución por competencia y el resto de la vista son MB-5D-2.
// ---------------------------------------------------------------------------
describe('evaluaciones — historial propio (GET /me/evaluations)', () => {
  beforeEach(() => {
    vi.mocked(solicitar).mockResolvedValue(PAGINA_PROPIA)
  })

  it('llama a GET /api/v1/me/evaluations con el token de la sesión', async () => {
    await listarEvaluacionesPropias('token-empleado')

    expect(solicitar).toHaveBeenCalledTimes(1)
    const [ruta, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(ruta.startsWith('/api/v1/me/evaluations?')).toBe(true)
    expect(opciones).toEqual({ token: 'token-empleado' })
  })

  it('es un GET: no declara método ni cuerpo', async () => {
    await listarEvaluacionesPropias('token-empleado')

    const [, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(opciones.metodo).toBeUndefined()
    expect(opciones.cuerpo).toBeUndefined()
  })

  it('no usa la ruta de RH ni acepta un empleadoId del cliente (§32)', async () => {
    await listarEvaluacionesPropias('token-empleado')

    const ruta = rutaDeLaUltimaLlamada()
    expect(ruta).not.toContain('/rh/')
    // La identidad la deriva el backend del token: la ruta no lleva el id.
    expect(ruta).not.toContain('/employees/')
    // Solo se le pasa el token y la paginación: ningún empleadoId.
    expect(vi.mocked(solicitar).mock.calls[0][1]).toEqual({ token: 'token-empleado' })
  })

  it('envía la paginación pedida: pagina y por_pagina', async () => {
    await listarEvaluacionesPropias('token-empleado', { pagina: 3, porPagina: 50 })

    expect(consultaDeLaUltimaLlamada().get('pagina')).toBe('3')
    expect(consultaDeLaUltimaLlamada().get('por_pagina')).toBe('50')
  })

  it('sin argumentos aplica los defaults del contrato (1 y 20)', async () => {
    await listarEvaluacionesPropias('token-empleado')

    expect(consultaDeLaUltimaLlamada().get('pagina')).toBe('1')
    expect(consultaDeLaUltimaLlamada().get('por_pagina')).toBe(String(POR_PAGINA_DEFECTO))
  })

  it('acota pagina a 1 y por_pagina al rango del contrato (1–100)', async () => {
    await listarEvaluacionesPropias('token-empleado', {
      pagina: 0,
      porPagina: POR_PAGINA_MAXIMO + 500,
    })

    expect(consultaDeLaUltimaLlamada().get('pagina')).toBe('1')
    expect(consultaDeLaUltimaLlamada().get('por_pagina')).toBe(String(POR_PAGINA_MAXIMO))
  })

  it('devuelve el EvaluacionEmpleadoPageOut sin transformarlo', async () => {
    await expect(listarEvaluacionesPropias('token-empleado')).resolves.toBe(PAGINA_PROPIA)
  })

  it('no añade nine_box ni ejes que el backend no envía (§21)', async () => {
    const resultado = await listarEvaluacionesPropias('token-empleado')

    // El snapshot llega tal cual: sin 9-Box, sin ejes y sin `cuerpo` inventado.
    expect(resultado).toBe(PAGINA_PROPIA)
    for (const item of resultado.items) {
      expect(item).not.toHaveProperty('nine_box')
      expect(item).not.toHaveProperty('performance_axis')
      expect(item).not.toHaveProperty('potential_axis')
      expect(item).not.toHaveProperty('box_code')
    }
  })

  it('no añade parámetros no definidos por el contrato (sin filtro por periodo)', async () => {
    await listarEvaluacionesPropias('token-empleado', { pagina: 2, porPagina: 10 })

    const consulta = consultaDeLaUltimaLlamada()
    expect([...consulta.keys()].sort()).toEqual(['pagina', 'por_pagina'])
  })

  it('propaga el 401 para que la vista cierre la sesión (§31/§32)', async () => {
    const error = Object.assign(new Error('no autorizado'), { estado: 401 })
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(listarEvaluacionesPropias('token-empleado')).rejects.toBe(error)
  })

  it('propaga un 500 para que la vista muestre su estado de error', async () => {
    const error = Object.assign(new Error('fallo del servidor'), { estado: 500 })
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(listarEvaluacionesPropias('token-empleado')).rejects.toBe(error)
  })

  it('el módulo NO expone ningún método de modificación de evaluaciones (§24)', async () => {
    // El contrato de /me/evaluations es de solo lectura: no existe POST,
    // PATCH ni DELETE en el backend, así que tampoco hay función aquí.
    const exportadas = {
      listarEvaluacionesPropias,
      listarEvaluacionesEmpleado,
    }
    const nombres = Object.keys(exportadas).join(' ').toLowerCase()
    expect(nombres).not.toMatch(/crear|actualizar|editar|eliminar|borrar|delete|patch|update/)

    await listarEvaluacionesPropias('token-empleado')

    const metodos = vi
      .mocked(solicitar)
      .mock.calls.map(([, opciones]) => opciones?.metodo)
      .filter(Boolean)
    expect(metodos).not.toContain('POST')
    expect(metodos).not.toContain('PATCH')
    expect(metodos).not.toContain('DELETE')
    expect(metodos).not.toContain('PUT')
  })
})
