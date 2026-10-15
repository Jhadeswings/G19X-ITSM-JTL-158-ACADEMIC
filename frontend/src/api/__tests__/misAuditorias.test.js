// Contrato de la consulta de correcciones de MIS participaciones para el
// Empleado (PRD §22; ET §25/§32). El cliente HTTP se mockea: sin red.
//
// Solo se verifica TRANSPORTE: ruta exacta GET /api/v1/me/audits con
// `pagina`/`por_pagina`, `{ token }` sin cuerpo, paginación por defecto del
// contrato (1 y 20), tope 1..100, respuesta sin transformar y propagación de
// errores (401/403/422). El filtrado por empleado y la autorización son del
// backend; aquí no se envía ni se confía en ningún `empleado_id`.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { solicitar } from '../clienteApi.js'
import {
  POR_PAGINA_DEFECTO,
  POR_PAGINA_MAXIMO,
  listarMisAuditorias,
} from '../misAuditorias.js'

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
      empleado_nombre: 'Ana López',
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

describe('misAuditorias — historial propio (GET /me/audits)', () => {
  it('llama a la ruta exacta con pagina/por_pagina y el token de la sesión', async () => {
    await listarMisAuditorias('token-empleado', { pagina: 2, porPagina: 10 })

    expect(solicitar).toHaveBeenCalledTimes(1)
    const [ruta, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(ruta).toContain('/api/v1/me/audits?')
    expect(consultaDeLaUltimaLlamada().get('pagina')).toBe('2')
    expect(consultaDeLaUltimaLlamada().get('por_pagina')).toBe('10')
    expect(opciones).toEqual({ token: 'token-empleado' })
    expect(opciones.metodo).toBeUndefined()
  })

  it('aplica la paginación por defecto del contrato (1 y 20)', async () => {
    await listarMisAuditorias('token-empleado')

    expect(consultaDeLaUltimaLlamada().get('pagina')).toBe('1')
    expect(consultaDeLaUltimaLlamada().get('por_pagina')).toBe(
      String(POR_PAGINA_DEFECTO),
    )
  })

  it('limita por_pagina al tope del contrato (1..100) sin pedir de más', async () => {
    await listarMisAuditorias('token-empleado', { pagina: 1, porPagina: 500 })
    expect(consultaDeLaUltimaLlamada().get('por_pagina')).toBe(
      String(POR_PAGINA_MAXIMO),
    )

    await listarMisAuditorias('token-empleado', { pagina: 0, porPagina: 0 })
    expect(consultaDeLaUltimaLlamada().get('pagina')).toBe('1')
    expect(consultaDeLaUltimaLlamada().get('por_pagina')).toBe('1')
  })

  it('nunca envía un empleado_id: el filtro es del token (§32)', async () => {
    await listarMisAuditorias('token-empleado')

    const [ruta, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(consultaDeLaUltimaLlamada().get('empleado_id')).toBeNull()
    expect(ruta).not.toMatch(/empleado/i)
    expect(opciones.cuerpo).toBeUndefined()
  })

  it('es una lectura GET sin cuerpo y sin parámetros extra', async () => {
    await listarMisAuditorias('token-empleado', { pagina: 1, porPagina: 20 })

    const [ruta, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(new URLSearchParams(ruta.split('?')[1]).get('porPagina')).toBeNull()
    expect(opciones.cuerpo).toBeUndefined()
  })

  it('devuelve la página sin transformarla', async () => {
    await expect(listarMisAuditorias('token-empleado')).resolves.toBe(PAGINA)
  })

  it('propaga 401, 403 y 422 para que la vista decida', async () => {
    const error401 = Object.assign(new Error('no autorizado'), { estado: 401 })
    vi.mocked(solicitar).mockRejectedValueOnce(error401)
    await expect(listarMisAuditorias('token-empleado')).rejects.toBe(error401)

    const error403 = Object.assign(new Error('prohibido'), { estado: 403 })
    vi.mocked(solicitar).mockRejectedValueOnce(error403)
    await expect(listarMisAuditorias('token-empleado')).rejects.toBe(error403)

    const error422 = Object.assign(new Error('inválido'), { estado: 422 })
    vi.mocked(solicitar).mockRejectedValueOnce(error422)
    await expect(listarMisAuditorias('token-empleado')).rejects.toBe(error422)
  })
})
