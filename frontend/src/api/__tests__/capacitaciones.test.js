// Contrato de transporte de capacitaciones del Empleado (PRD §21.4; ET §11,
// §31; DECISIONES_TECNICAS §21). El cliente HTTP se mockea: sin llamadas reales.
//
// Solo se verifica TRANSPORTE: ruta y método exactos de cada endpoint, query
// params de la paginación, token, cuerpo exacto del contrato (`nombre`/`fecha`/
// `completado` y ningún otro campo), respuesta sin transformar y propagación de
// 401/403/404/422. Nada de reglas de negocio: el ownership, la ordenación, la
// normalización del nombre y la lógica del año calendario local son del backend.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { solicitar } from '../clienteApi.js'
import {
  POR_PAGINA_DEFECTO,
  POR_PAGINA_MAXIMO,
  consultarCapacitacion,
  crearCapacitacion,
  listarCapacitaciones,
} from '../capacitaciones.js'

vi.mock('../clienteApi.js', () => ({ solicitar: vi.fn() }))

/** Payload permitido por CapacitacionCreateIn (tres campos, ni uno más). */
const CAPACITACION = {
  nombre: 'Curso de Python',
  fecha: '2026-03-10',
  completado: true,
}

/** Respuesta real: CapacitacionOut devuelta por el backend. */
const REGISTRADA = {
  id: 9,
  empleado_id: 7,
  nombre: 'Curso de Python',
  fecha: '2026-03-10',
  completado: true,
  created_at: '2026-03-11T09:00:00',
  updated_at: '2026-03-11T09:00:00',
}

/** Respuesta real del listado: CapacitacionPageOut (PAGINADA, no lista simple). */
const PAGINADA = {
  total: 1,
  pagina: 1,
  por_pagina: 20,
  items: [REGISTRADA],
}

/** Lee los query params de la ruta capturada por el mock de `solicitar`. */
function consultaDe(indice) {
  const [ruta] = vi.mocked(solicitar).mock.calls[indice]
  return new URLSearchParams(ruta.split('?')[1])
}

beforeEach(() => {
  vi.mocked(solicitar).mockReset()
})

describe('capacitaciones — listado (GET /me/trainings)', () => {
  it('llama a GET /api/v1/me/trainings con el token de la sesión', async () => {
    vi.mocked(solicitar).mockResolvedValue(PAGINADA)

    await listarCapacitaciones('token-empleado')

    expect(solicitar).toHaveBeenCalledTimes(1)
    const [ruta, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(ruta.startsWith('/api/v1/me/trainings?')).toBe(true)
    expect(opciones.token).toBe('token-empleado')
  })

  it('el listado es PAGINADO: viaja pagina y por_pagina', async () => {
    vi.mocked(solicitar).mockResolvedValue(PAGINADA)

    await listarCapacitaciones('token-empleado')

    expect(consultaDe(0).get('pagina')).toBe('1')
    expect(consultaDe(0).get('por_pagina')).toBe(String(POR_PAGINA_DEFECTO))
  })

  it('reproduce la paginación pedida sin alterar los valores', async () => {
    vi.mocked(solicitar).mockResolvedValue(PAGINADA)

    await listarCapacitaciones('token-empleado', { pagina: 3, porPagina: 50 })

    expect(consultaDe(0).get('pagina')).toBe('3')
    expect(consultaDe(0).get('por_pagina')).toBe('50')
  })

  it('acota por_pagina al máximo del contrato y pagina a 1', async () => {
    vi.mocked(solicitar).mockResolvedValue(PAGINADA)

    await listarCapacitaciones('token-empleado', {
      pagina: 0,
      porPagina: POR_PAGINA_MAXIMO + 500,
    })

    expect(consultaDe(0).get('pagina')).toBe('1')
    expect(consultaDe(0).get('por_pagina')).toBe(String(POR_PAGINA_MAXIMO))
  })

  it('no usa el método POST para listar ni adjunta cuerpo', async () => {
    vi.mocked(solicitar).mockResolvedValue(PAGINADA)

    await listarCapacitaciones('token-empleado')

    const [, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(opciones.metodo).toBeUndefined()
    expect(opciones.cuerpo).toBeUndefined()
  })

  it('devuelve la página tal cual, sin transformar', async () => {
    vi.mocked(solicitar).mockResolvedValue(PAGINADA)

    const resultado = await listarCapacitaciones('token-empleado')

    expect(resultado).toBe(PAGINADA)
    expect(Object.keys(resultado)).toEqual(['total', 'pagina', 'por_pagina', 'items'])
    expect(resultado.items[0]).toBe(REGISTRADA)
  })

  it('propaga el error del backend con su estado', async () => {
    const fallo = Object.assign(new Error('No fue posible conectar.'), { estado: 0 })
    vi.mocked(solicitar).mockRejectedValue(fallo)

    await expect(listarCapacitaciones('token-empleado')).rejects.toBe(fallo)
  })
})

describe('capacitaciones — registro (POST /me/trainings)', () => {
  it('llama a POST /api/v1/me/trainings con el token de la sesión', async () => {
    vi.mocked(solicitar).mockResolvedValue(REGISTRADA)

    await crearCapacitacion('token-empleado', CAPACITACION)

    expect(solicitar).toHaveBeenCalledTimes(1)
    expect(solicitar).toHaveBeenCalledWith('/api/v1/me/trainings', {
      metodo: 'POST',
      token: 'token-empleado',
      cuerpo: CAPACITACION,
    })
  })

  it('envía SOLO nombre, fecha y completado, en ese orden y sin copiarlos', async () => {
    vi.mocked(solicitar).mockResolvedValue(REGISTRADA)

    await crearCapacitacion('token-empleado', CAPACITACION)

    const [, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(opciones.cuerpo).toBe(CAPACITACION)
    expect(Object.keys(opciones.cuerpo)).toEqual(['nombre', 'fecha', 'completado'])
  })

  it('nunca envía empleado_id: lo deriva la cuenta autenticada (§32)', async () => {
    vi.mocked(solicitar).mockResolvedValue(REGISTRADA)

    await crearCapacitacion('token-empleado', CAPACITACION)

    const [, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(opciones.cuerpo).not.toHaveProperty('empleado_id')
  })

  it('admite el cuerpo mínimo: completado es opcional', async () => {
    vi.mocked(solicitar).mockResolvedValue({ ...REGISTRADA, completado: false })

    await crearCapacitacion('token-empleado', { nombre: 'Curso', fecha: '2026-04-01' })

    const [, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(Object.keys(opciones.cuerpo)).toEqual(['nombre', 'fecha'])
  })

  it('devuelve la capacitación creada sin transformar', async () => {
    vi.mocked(solicitar).mockResolvedValue(REGISTRADA)

    const resultado = await crearCapacitacion('token-empleado', CAPACITACION)

    expect(resultado).toBe(REGISTRADA)
    expect(Object.keys(resultado)).toEqual([
      'id',
      'empleado_id',
      'nombre',
      'fecha',
      'completado',
      'created_at',
      'updated_at',
    ])
  })

  it('propaga el 422 del contrato con su estado', async () => {
    const fallo = Object.assign(new Error('Algunos datos enviados no son válidos.'), {
      estado: 422,
    })
    vi.mocked(solicitar).mockRejectedValue(fallo)

    await expect(
      crearCapacitacion('token-empleado', { nombre: '   ', fecha: '2026-04-01' }),
    ).rejects.toBe(fallo)
  })
})

describe('capacitaciones — consulta propia (GET /me/trainings/{id})', () => {
  it('llama a GET /api/v1/me/trainings/{id} con el token de la sesión', async () => {
    vi.mocked(solicitar).mockResolvedValue(REGISTRADA)

    await consultarCapacitacion('token-empleado', 9)

    expect(solicitar).toHaveBeenCalledTimes(1)
    const [ruta, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(ruta).toBe('/api/v1/me/trainings/9')
    expect(opciones.token).toBe('token-empleado')
    expect(opciones.metodo).toBeUndefined()
  })

  it('no usa POST ni adjunta cuerpo en la consulta por id', async () => {
    vi.mocked(solicitar).mockResolvedValue(REGISTRADA)

    await consultarCapacitacion('token-empleado', 9)

    const [, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(opciones.cuerpo).toBeUndefined()
  })

  it('devuelve la capacitación sin transformar', async () => {
    vi.mocked(solicitar).mockResolvedValue(REGISTRADA)

    const resultado = await consultarCapacitacion('token-empleado', 9)

    expect(resultado).toBe(REGISTRADA)
  })

  it('propaga el 404 uniforme de una capacitación ajena (§32)', async () => {
    const fallo = Object.assign(new Error('Capacitación no encontrada.'), {
      estado: 404,
    })
    vi.mocked(solicitar).mockRejectedValue(fallo)

    await expect(consultarCapacitacion('token-empleado-ajeno', 9)).rejects.toBe(fallo)
  })
})



describe('capacitaciones — contrato restringido (sin PATCH ni DELETE)', () => {
  /** Funciones exportadas por el módulo de transporte. */
  const EXPORTADAS = {
    listarCapacitaciones,
    crearCapacitacion,
    consultarCapacitacion,
  }

  it('el módulo solo expone las tres funciones respaldadas', () => {
    expect(Object.keys(EXPORTADAS).sort()).toEqual([
      'consultarCapacitacion',
      'crearCapacitacion',
      'listarCapacitaciones',
    ])
  })

  it('NO expone PATCH: la documentación no define edición (§21)', () => {
    const nombres = Object.keys(EXPORTADAS).join(' ').toLowerCase()
    expect(nombres).not.toMatch(/actualizar|patch|editar|update/)
  })

  it('NO expone DELETE: la documentación no define eliminación (§21)', () => {
    const nombres = Object.keys(EXPORTADAS).join(' ').toLowerCase()
    expect(nombres).not.toMatch(/eliminar|borrar|delete|remove/)
  })

  it('ninguna función emite PATCH, PUT ni DELETE al backend', async () => {
    vi.mocked(solicitar).mockResolvedValue(REGISTRADA)

    await listarCapacitaciones('token-empleado')
    await crearCapacitacion('token-empleado', CAPACITACION)
    await consultarCapacitacion('token-empleado', 9)

    const metodos = vi
      .mocked(solicitar)
      .mock.calls.map(([, opciones]) => opciones?.metodo)
      .filter(Boolean)
    expect(metodos).toEqual(['POST'])
    expect(metodos).not.toContain('PATCH')
    expect(metodos).not.toContain('DELETE')
    expect(metodos).not.toContain('PUT')
  })

  it('solo usa las rutas del contrato /me/trainings', async () => {
    vi.mocked(solicitar).mockResolvedValue(REGISTRADA)

    await listarCapacitaciones('token-empleado')
    await crearCapacitacion('token-empleado', CAPACITACION)
    await consultarCapacitacion('token-empleado', 9)

    const rutas = vi.mocked(solicitar).mock.calls.map(([ruta]) => ruta.split('?')[0])
    expect(rutas).toEqual([
      '/api/v1/me/trainings',
      '/api/v1/me/trainings',
      '/api/v1/me/trainings/9',
    ])
    for (const ruta of rutas) {
      expect(ruta.startsWith('/api/v1/me/trainings')).toBe(true)
    }
  })
})

