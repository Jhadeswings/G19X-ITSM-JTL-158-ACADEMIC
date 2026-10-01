// Contrato de proyectos del Empleado (PRD §11, §21.3; Especificación §6–§8, §31).
// El cliente HTTP se mockea: sin llamadas reales al backend.
//
// Solo se verifica TRANSPORTE: rutas exactas, `nombre` como query, codificación
// del valor, `{ token }`, respuesta sin transformar y propagación de los
// errores del contrato (401/409/422). Ninguna regla de negocio se prueba aquí
// (normalización, umbral de similitud, unicidad o EN_PROCESO son del backend).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { solicitar } from '../clienteApi.js'
import { buscarProyectos, crearProyecto } from '../proyectos.js'

vi.mock('../clienteApi.js', () => ({ solicitar: vi.fn() }))

/** Respuesta real del backend: coincidencia exacta y sin sugerencias. */
const BUSQUEDA_EXACTA = {
  consulta_normalizada: 'proyecto arbol',
  coincidencia_exacta: {
    id: 3,
    nombre: 'Proyecto ÁRBOL',
    nombre_normalizado: 'proyecto arbol',
    area: 'Operaciones',
    cliente: 'Cliente interno',
    estado: 'EN_PROCESO',
    created_at: '2026-06-01T10:00:00',
    updated_at: '2026-06-01T10:00:00',
  },
  sugerencias: [],
}

/** Respuesta real del backend: sin coincidencia exacta, con sugerencias. */
const BUSQUEDA_CON_SUGERENCIAS = {
  consulta_normalizada: 'proyecto arbol',
  coincidencia_exacta: null,
  sugerencias: [
    {
      proyecto: {
        id: 9,
        nombre: 'Proyecto Arbolado',
        nombre_normalizado: 'proyecto arbolado',
        area: null,
        cliente: null,
        estado: 'COMPLETADO',
        created_at: '2026-05-01T10:00:00',
        updated_at: '2026-06-01T10:00:00',
      },
      similitud: 0.55,
    },
  ],
}

/** Respuesta real de POST: ProyectoOut recién creado. */
const PROYECTO_CREADO = {
  id: 12,
  nombre: 'Proyecto Roble',
  nombre_normalizado: 'proyecto roble',
  area: 'TI',
  cliente: null,
  estado: 'EN_PROCESO',
  created_at: '2026-09-30T09:00:00',
  updated_at: '2026-09-30T09:00:00',
}

function errorDe(estado, mensaje) {
  return Object.assign(new Error(mensaje), { estado })
}

beforeEach(() => {
  vi.mocked(solicitar).mockReset()
})

describe('proyectos — búsqueda obligatoria (GET /me/projects/search)', () => {
  it('llama a la ruta exacta con `nombre` como query y el token de la sesión', async () => {
    vi.mocked(solicitar).mockResolvedValue(BUSQUEDA_EXACTA)

    await buscarProyectos('token-empleado', 'Proyecto ÁRBOL')

    expect(solicitar).toHaveBeenCalledTimes(1)
    expect(solicitar).toHaveBeenCalledWith(
      `/api/v1/me/projects/search?nombre=${encodeURIComponent('Proyecto ÁRBOL')}`,
      { token: 'token-empleado' },
    )
  })

  it('codifica el nombre con encodeURIComponent sin alterar el valor', async () => {
    vi.mocked(solicitar).mockResolvedValue(BUSQUEDA_CON_SUGERENCIAS)

    await buscarProyectos('token-empleado', 'a/b & c?d=1')

    const [ruta] = vi.mocked(solicitar).mock.calls[0]
    expect(ruta).toBe(
      `/api/v1/me/projects/search?nombre=${encodeURIComponent('a/b & c?d=1')}`,
    )
    expect(ruta).not.toContain('+')
    expect(ruta).toContain('%2F')
  })

  it('es una lectura GET sin cuerpo y sin parámetros extra', async () => {
    vi.mocked(solicitar).mockResolvedValue(BUSQUEDA_EXACTA)

    await buscarProyectos('token-empleado', 'roble')

    const [ruta, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(ruta).toBe('/api/v1/me/projects/search?nombre=roble')
    expect(opciones).toEqual({ token: 'token-empleado' })
    expect(opciones.metodo).toBeUndefined()
    expect(opciones.cuerpo).toBeUndefined()
  })

  it('devuelve la respuesta del backend tal cual (sin filtrar ni ordenar)', async () => {
    vi.mocked(solicitar).mockResolvedValue(BUSQUEDA_CON_SUGERENCIAS)

    await expect(buscarProyectos('token-empleado', 'arbol')).resolves.toBe(
      BUSQUEDA_CON_SUGERENCIAS,
    )
  })

  it('conserva las 7 sugerencias si el backend las enviara (no aplica topes)', async () => {
    const siete = {
      consulta_normalizada: 'arbol',
      coincidencia_exacta: null,
      sugerencias: Array.from({ length: 7 }, (_, i) => ({
        proyecto: { id: i + 1, nombre: `Proyecto ${i + 1}` },
        similitud: 0.9 - i * 0.05,
      })),
    }
    vi.mocked(solicitar).mockResolvedValue(siete)

    const resultado = await buscarProyectos('token-empleado', 'arbol')

    expect(resultado.sugerencias).toHaveLength(7)
  })

  it('propaga el 422 del backend (nombre inválido) sin reinterpretarlo', async () => {
    const error = errorDe(422, 'El nombre de búsqueda no puede estar vacío.')
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(buscarProyectos('token-empleado', '   ')).rejects.toBe(error)
  })

  it('propaga el 401 de la sesión expirada', async () => {
    const error = errorDe(401, 'Credenciales inválidas.')
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(buscarProyectos('token-empleado', 'roble')).rejects.toBe(error)
  })
})

describe('proyectos — alta (POST /me/projects)', () => {
  it('llama a POST con el cuerpo del contrato y el token de la sesión', async () => {
    vi.mocked(solicitar).mockResolvedValue(PROYECTO_CREADO)

    await crearProyecto('token-empleado', {
      nombre: 'Proyecto Roble',
      area: 'TI',
      cliente: null,
    })

    expect(solicitar).toHaveBeenCalledTimes(1)
    expect(solicitar).toHaveBeenCalledWith('/api/v1/me/projects', {
      metodo: 'POST',
      token: 'token-empleado',
      cuerpo: { nombre: 'Proyecto Roble', area: 'TI', cliente: null },
    })
  })

  it('no envía `estado` ni ningún campo fuera del contrato', async () => {
    vi.mocked(solicitar).mockResolvedValue(PROYECTO_CREADO)

    await crearProyecto('token-empleado', { nombre: 'Proyecto Roble' })

    const [, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(Object.keys(opciones.cuerpo)).toEqual(['nombre'])
    expect(opciones.cuerpo.estado).toBeUndefined()
  })

  it('devuelve el ProyectoOut del backend sin transformarlo', async () => {
    vi.mocked(solicitar).mockResolvedValue(PROYECTO_CREADO)

    await expect(
      crearProyecto('token-empleado', { nombre: 'Proyecto Roble' }),
    ).resolves.toBe(PROYECTO_CREADO)
  })

  it('propaga el 409 de duplicado exacto con su mensaje', async () => {
    const error = errorDe(
      409,
      'Ya existe un proyecto con ese nombre (coincidencia exacta).',
    )
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(
      crearProyecto('token-empleado', { nombre: 'Proyecto ÁRBOL' }),
    ).rejects.toMatchObject({
      estado: 409,
      message: 'Ya existe un proyecto con ese nombre (coincidencia exacta).',
    })
  })

  it('propaga el 422 de validación sin reinterpretarlo', async () => {
    const error = errorDe(422, 'Algunos datos enviados no son válidos.')
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(
      crearProyecto('token-empleado', { nombre: '' }),
    ).rejects.toBe(error)
  })

  it('propaga el 401 de la sesión expirada', async () => {
    const error = errorDe(401, 'Credenciales inválidas.')
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(
      crearProyecto('token-empleado', { nombre: 'Proyecto Roble' }),
    ).rejects.toBe(error)
  })
})
