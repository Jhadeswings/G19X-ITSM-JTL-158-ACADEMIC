// Contrato de proyectos del Empleado (PRD §11, §21.3; Especificación §6–§8, §31).
// El cliente HTTP se mockea: sin llamadas reales al backend.
//
// Solo se verifica TRANSPORTE: rutas exactas, `nombre` como query, codificación
// del valor, `{ token }`, respuesta sin transformar y propagación de los
// errores del contrato (401/409/422). Ninguna regla de negocio se prueba aquí
// (normalización, umbral de similitud, unicidad o EN_PROCESO son del backend).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { solicitar } from '../clienteApi.js'
import {
  POR_PAGINA_DEFECTO_RH,
  POR_PAGINA_MAXIMO_RH,
  actualizarProyectoRh,
  buscarProyectos,
  consultarProyectoRh,
  crearProyecto,
  listarMisProyectos,
  listarProyectosRh,
} from '../proyectos.js'

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

// MB-7-1: listado propio de proyectos (ET §31, PRD §21.1).
// Solo se verifica TRANSPORTE: ruta exacta, paginación opcional, `{ token }`,
// ausencia total de `empleado_id`, respuesta sin transformar y propagación
// de errores. La pertenencia (participación) y el orden son del backend.
describe('proyectos — listado propio (GET /me/projects)', () => {
  /** Respuesta real del backend: ProyectoPageOut con un proyecto. */
  const PAGINA = {
    total: 1,
    pagina: 1,
    por_pagina: 20,
    items: [
      {
        id: 7,
        nombre: 'Proyecto Roble',
        nombre_normalizado: 'proyecto roble',
        area: 'TI',
        cliente: null,
        estado: 'EN_PROCESO',
        created_at: '2026-06-01T10:00:00',
        updated_at: '2026-06-01T10:00:00',
      },
    ],
  }

  it('llama a la ruta exacta con el token y sin paginación cuando se omite', async () => {
    vi.mocked(solicitar).mockResolvedValue(PAGINA)

    await listarMisProyectos('token-empleado')

    expect(solicitar).toHaveBeenCalledWith('/api/v1/me/projects', {
      token: 'token-empleado',
    })
  })

  it('envía la paginación solo si se indica', async () => {
    vi.mocked(solicitar).mockResolvedValue(PAGINA)

    await listarMisProyectos('token-empleado', { pagina: 2, por_pagina: 5 })

    const [ruta, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(ruta).toContain('/api/v1/me/projects?')
    expect(ruta).toContain('pagina=2')
    expect(ruta).toContain('por_pagina=5')
    expect(opciones).toEqual({ token: 'token-empleado' })
  })

  it('no envía paginación parcial si solo se indica una', async () => {
    vi.mocked(solicitar).mockResolvedValue(PAGINA)

    await listarMisProyectos('token-empleado', { pagina: 3 })

    const [ruta] = vi.mocked(solicitar).mock.calls[0]
    expect(ruta).toContain('pagina=3')
    expect(ruta).not.toContain('por_pagina')
  })

  it('NO acepta ni envía empleado_id: la identidad la deriva el token', async () => {
    vi.mocked(solicitar).mockResolvedValue(PAGINA)

    await listarMisProyectos('token-empleado')

    const [ruta, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(ruta).not.toContain('empleado_id')
    expect(Object.keys(opciones)).toEqual(['token'])
  })

  it('no transforma la respuesta del backend', async () => {
    const respuesta = {
      total: 0,
      pagina: 1,
      por_pagina: 20,
      items: [],
    }
    vi.mocked(solicitar).mockResolvedValue(respuesta)

    const resultado = await listarMisProyectos('token-empleado')

    expect(resultado).toBe(respuesta)
    expect(resultado).toEqual({ total: 0, pagina: 1, por_pagina: 20, items: [] })
  })

  it('propaga el 401 de la sesión expirada', async () => {
    const error = errorDe(401, 'Credenciales inválidas.')
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(listarMisProyectos('token-empleado')).rejects.toBe(error)
  })

  it('propaga el 403 de rol no autorizado sin reinterpretar', async () => {
    const error = errorDe(403, 'Solo el rol Empleado puede consultar.')
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(listarMisProyectos('token-empleado')).rejects.toBe(error)
  })
})

// ---------------------------------------------------------------------------
// RH-02 — Administración de proyectos EXISTENTES (PRD §20.3; ET §31;
// DECISIONES §15). Solo TRANSPORTE: rutas exactas, métodos, paginación del
// contrato y respuestas sin transformar. RH NO crea proyectos: no existe
// ninguna función POST /rh/projects en este módulo.
// ---------------------------------------------------------------------------
describe('proyectos RH — catálogo (GET /rh/projects)', () => {
  it('llama a GET /api/v1/rh/projects con el token y los defaults del contrato', async () => {
    await listarProyectosRh('token-rh')

    expect(solicitar).toHaveBeenCalledTimes(1)
    const [ruta, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(ruta.startsWith('/api/v1/rh/projects?')).toBe(true)
    expect(ruta).toContain('pagina=1')
    expect(ruta).toContain(`por_pagina=${POR_PAGINA_DEFECTO_RH}`)
    expect(opciones).toEqual({ token: 'token-rh' })
    expect(opciones.metodo).toBeUndefined()
  })

  it('respeta el tope de por_pagina y la página solicitada', async () => {
    await listarProyectosRh('token-rh', {
      pagina: 3,
      porPagina: POR_PAGINA_MAXIMO_RH + 500,
    })

    const [ruta] = vi.mocked(solicitar).mock.calls[0]
    expect(ruta).toContain('pagina=3')
    expect(ruta).toContain(`por_pagina=${POR_PAGINA_MAXIMO_RH}`)
  })

  it('no envía filtros estado/area que la vista aún no usa', async () => {
    await listarProyectosRh('token-rh')

    const [ruta] = vi.mocked(solicitar).mock.calls[0]
    expect(ruta).not.toContain('estado=')
    expect(ruta).not.toContain('area=')
    // El contrato tampoco acepta empleado_id: la identidad nunca se envía.
    expect(ruta).not.toContain('empleado_id')
  })

  it('propaga 401 y 500 para que la vista decida', async () => {
    const error401 = errorDe(401, 'no autorizado')
    vi.mocked(solicitar).mockRejectedValueOnce(error401)
    await expect(listarProyectosRh('token-rh')).rejects.toBe(error401)

    const error500 = errorDe(500, 'fallo del servidor')
    vi.mocked(solicitar).mockRejectedValueOnce(error500)
    await expect(listarProyectosRh('token-rh')).rejects.toBe(error500)
  })
})

describe('proyectos RH — consulta individual (GET /rh/projects/{id})', () => {
  it('usa la ruta exacta con el id y el token', async () => {
    await consultarProyectoRh('token-rh', 7)

    expect(solicitar).toHaveBeenCalledWith('/api/v1/rh/projects/7', {
      token: 'token-rh',
    })
  })

  it('devuelve el ProyectoOut sin transformarlo', async () => {
    const respuesta = BUSQUEDA_EXACTA.coincidencia_exacta
    vi.mocked(solicitar).mockResolvedValue(respuesta)

    await expect(consultarProyectoRh('token-rh', 3)).resolves.toBe(respuesta)
  })

  it('propaga el 404 de proyecto inexistente', async () => {
    const error = errorDe(404, 'Proyecto no encontrado.')
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(consultarProyectoRh('token-rh', 999)).rejects.toBe(error)
  })
})

describe('proyectos RH — edición administrativa (PATCH /rh/projects/{id})', () => {
  it('hace PATCH a la ruta exacta con SOLO el cuerpo de cambios', async () => {
    vi.mocked(solicitar).mockResolvedValue(BUSQUEDA_EXACTA.coincidencia_exacta)

    await actualizarProyectoRh('token-rh', 3, { estado: 'CANCELADO' })

    expect(solicitar).toHaveBeenCalledWith('/api/v1/rh/projects/3', {
      metodo: 'PATCH',
      token: 'token-rh',
      cuerpo: { estado: 'CANCELADO' },
    })
  })

  it('devuelve el ProyectoOut actualizado sin transformarlo', async () => {
    const respuesta = { ...BUSQUEDA_EXACTA.coincidencia_exacta, estado: 'COMPLETADO' }
    vi.mocked(solicitar).mockResolvedValue(respuesta)

    await expect(
      actualizarProyectoRh('token-rh', 3, { estado: 'COMPLETADO' }),
    ).resolves.toBe(respuesta)
  })

  it('propaga 409 (nombre duplicado) y 422 (sin campos/estado inválido)', async () => {
    const conflicto = errorDe(409, 'Ya existe otro proyecto con ese nombre.')
    vi.mocked(solicitar).mockRejectedValueOnce(conflicto)
    await expect(
      actualizarProyectoRh('token-rh', 3, { nombre: 'Proyecto Roble' }),
    ).rejects.toBe(conflicto)

    const invalido = errorDe(422, 'Debe proporcionar al menos un campo a actualizar.')
    vi.mocked(solicitar).mockRejectedValueOnce(invalido)
    await expect(actualizarProyectoRh('token-rh', 3, {})).rejects.toBe(invalido)
  })

  it('el módulo sigue sin exponer creación para RH (DECISIONES §15)', async () => {
    const modulo = await vi.importActual('../proyectos.js')
    expect(Object.keys(modulo)).not.toContain('crearProyectoRh')
    // La única función con POST del módulo sigue siendo la del Empleado.
    await crearProyecto('token-empleado', { nombre: 'X' })
    const [, opciones] = vi.mocked(solicitar).mock.calls.at(-1)
    expect(opciones.metodo).toBe('POST')
    expect(vi.mocked(solicitar).mock.calls.at(-1)[0]).toBe('/api/v1/me/projects')
  })
})
