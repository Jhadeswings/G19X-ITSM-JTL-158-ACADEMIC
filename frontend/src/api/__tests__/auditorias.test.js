// Contrato de la consulta de auditoría para RH (Tarea C; PRD §22; ET §25).
// El cliente HTTP se mockea: sin llamadas reales al backend.
//
// Solo se verifica TRANSPORTE: ruta exacta GET /api/v1/rh/audits con
// `pagina`/`por_pagina`, `{ token }` sin cuerpo, paginación por defecto del
// contrato (1 y 20), tope 1..100, respuesta sin transformar y propagación de
// errores (401/422). Ninguna regla de negocio se prueba aquí (el orden
// fecha DESC + id DESC y la autorización son del backend).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { solicitar } from '../clienteApi.js'
import {
  POR_PAGINA_DEFECTO,
  POR_PAGINA_MAXIMO,
  listarAuditorias,
} from '../auditorias.js'

vi.mock('../clienteApi.js', () => ({ solicitar: vi.fn() }))

/** Respuesta real del backend: `AuditoriaPageOut`. */
const PAGINA = {
  total: 1,
  pagina: 1,
  por_pagina: 20,
  items: [
    {
      id: 1,
      actor_cuenta_id: 4,
      actor_email: 'rh@empresa.dev',
      entidad: 'participacion',
      entidad_id: 7,
      operacion: 'CORRECCION',
      valores_anteriores: { horas: 100 },
      valores_nuevos: { horas: 150 },
      motivo: 'Corrección de horas',
      fecha: '2026-10-01T12:00:00+00:00',
      empleado_nombre: 'Vanesa Gutiérrez Zamora',
      proyecto_nombre: 'Prueba 1',
    },
  ],
}

/** Query params de la última llamada como URLSearchParams. */
function consultaDeLaUltimaLlamada() {
  const [ruta] = vi.mocked(solicitar).mock.calls.at(-1)
  return new URLSearchParams(ruta.split('?')[1])
}

beforeEach(() => {
  vi.mocked(solicitar).mockReset()
  vi.mocked(solicitar).mockResolvedValue(PAGINA)
})

describe('auditorias — consulta paginada (GET /rh/audits)', () => {
  it('llama a la ruta exacta con pagina/por_pagina y el token de la sesión', async () => {
    await listarAuditorias('token-rh', { pagina: 2, porPagina: 10 })

    expect(solicitar).toHaveBeenCalledTimes(1)
    const [ruta, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(ruta).toContain('/api/v1/rh/audits?')
    expect(consultaDeLaUltimaLlamada().get('pagina')).toBe('2')
    expect(consultaDeLaUltimaLlamada().get('por_pagina')).toBe('10')
    expect(opciones).toEqual({ token: 'token-rh' })
    expect(opciones.metodo).toBeUndefined()
  })

  it('aplica la paginación por defecto del contrato (1 y 20)', async () => {
    await listarAuditorias('token-rh')

    expect(consultaDeLaUltimaLlamada().get('pagina')).toBe('1')
    expect(consultaDeLaUltimaLlamada().get('por_pagina')).toBe(
      String(POR_PAGINA_DEFECTO),
    )
  })

  it('limita por_pagina al tope del contrato (1..100) sin pedir de más', async () => {
    await listarAuditorias('token-rh', { pagina: 1, porPagina: 500 })
    expect(consultaDeLaUltimaLlamada().get('por_pagina')).toBe(
      String(POR_PAGINA_MAXIMO),
    )

    await listarAuditorias('token-rh', { pagina: 0, porPagina: 0 })
    expect(consultaDeLaUltimaLlamada().get('pagina')).toBe('1')
    expect(consultaDeLaUltimaLlamada().get('por_pagina')).toBe('1')
  })

  it('es una lectura GET sin cuerpo y sin parámetros extra', async () => {
    await listarAuditorias('token-rh', { pagina: 1, porPagina: 20 })

    const [ruta, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(new URLSearchParams(ruta.split('?')[1]).get('porPagina')).toBeNull()
    expect(opciones.cuerpo).toBeUndefined()
  })

  it('devuelve la página sin transformarla', async () => {
    await expect(listarAuditorias('token-rh')).resolves.toBe(PAGINA)
  })

  it('propaga 401 y 422 para que la vista decida', async () => {
    const error401 = Object.assign(new Error('no autorizado'), { estado: 401 })
    vi.mocked(solicitar).mockRejectedValueOnce(error401)
    await expect(listarAuditorias('token-rh')).rejects.toBe(error401)

    const error422 = Object.assign(new Error('inválido'), { estado: 422 })
    vi.mocked(solicitar).mockRejectedValueOnce(error422)
    await expect(listarAuditorias('token-rh')).rejects.toBe(error422)
  })
})
