// Contrato del alta de empleado por RH (PRD §3.3; Especificación Técnica §31).
// El cliente HTTP se mockea: sin llamadas reales al backend.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { solicitar } from '../clienteApi.js'
import {
  crearEmpleado,
  listarEmpleados,
  obtenerEmpleado,
  obtenerResultadoActual,
  POR_PAGINA_DEFECTO,
} from '../empleados.js'

vi.mock('../clienteApi.js', () => ({ solicitar: vi.fn() }))

const DATOS = {
  nombre: 'Empleado Nuevo',
  email: 'nuevo@empresa.dev',
  puesto: 'Desarrollador',
  area: 'TI',
  fecha_ingreso: '2026-01-15',
}

/** Ruta llamada en la última petición al cliente HTTP. */
function rutaDeLaUltimaLlamada() {
  return vi.mocked(solicitar).mock.calls.at(-1)[0]
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

// ---------------------------------------------------------------------------
// Listado (PRD §20.1). Solo se usan los parámetros que el backend acepta:
// pagina, por_pagina, activo y area.
// ---------------------------------------------------------------------------
describe('empleados — listado por RH', () => {
  beforeEach(() => {
    vi.mocked(solicitar).mockResolvedValue({
      total: 0,
      pagina: 1,
      por_pagina: POR_PAGINA_DEFECTO,
      items: [],
    })
  })

  it('llama a GET /api/v1/rh/employees con el token de la sesión', async () => {
    await listarEmpleados('token-rh', {})

    expect(solicitar).toHaveBeenCalledTimes(1)
    const [ruta, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(ruta).toContain('/api/v1/rh/employees?')
    expect(opciones).toEqual({ token: 'token-rh' })
    expect(opciones.metodo).toBeUndefined()
  })

  it('envía pagina y por_pagina por defecto', async () => {
    await listarEmpleados('token-rh', {})

    const consulta = new URLSearchParams(rutaDeLaUltimaLlamada().split('?')[1])
    expect(consulta.get('pagina')).toBe('1')
    expect(consulta.get('por_pagina')).toBe(String(POR_PAGINA_DEFECTO))
  })

  it('envía la página solicitada', async () => {
    await listarEmpleados('token-rh', { pagina: 3 })

    const consulta = new URLSearchParams(rutaDeLaUltimaLlamada().split('?')[1])
    expect(consulta.get('pagina')).toBe('3')
  })

  it('envía por_pagina dentro del límite que acepta el backend', async () => {
    await listarEmpleados('token-rh', { porPagina: 50 })

    const consulta = new URLSearchParams(rutaDeLaUltimaLlamada().split('?')[1])
    expect(consulta.get('por_pagina')).toBe('50')
  })

  it('acota por_pagina al máximo del backend para no provocar un 422', async () => {
    await listarEmpleados('token-rh', { porPagina: 5000 })

    const consulta = new URLSearchParams(rutaDeLaUltimaLlamada().split('?')[1])
    expect(consulta.get('por_pagina')).toBe('100')
  })

  it('envía el filtro de estado cuando es true o false', async () => {
    await listarEmpleados('token-rh', { activo: true })
    expect(new URLSearchParams(rutaDeLaUltimaLlamada().split('?')[1]).get('activo')).toBe('true')

    await listarEmpleados('token-rh', { activo: false })
    expect(new URLSearchParams(rutaDeLaUltimaLlamada().split('?')[1]).get('activo')).toBe('false')
  })

  it('omite activo cuando no hay filtro de estado', async () => {
    await listarEmpleados('token-rh', { activo: undefined })

    const consulta = new URLSearchParams(rutaDeLaUltimaLlamada().split('?')[1])
    expect(consulta.has('activo')).toBe(false)
  })

  it('envía el filtro de área sin transformarlo', async () => {
    await listarEmpleados('token-rh', { area: 'TI' })

    const consulta = new URLSearchParams(rutaDeLaUltimaLlamada().split('?')[1])
    expect(consulta.get('area')).toBe('TI')
  })

  it('omite area cuando viene vacía o solo con espacios', async () => {
    await listarEmpleados('token-rh', { area: '   ' })

    const consulta = new URLSearchParams(rutaDeLaUltimaLlamada().split('?')[1])
    expect(consulta.has('area')).toBe(false)
  })

  it('combina paginación, estado y área en una sola petición', async () => {
    await listarEmpleados('token-rh', { pagina: 2, porPagina: 10, activo: false, area: 'Datos' })

    const consulta = new URLSearchParams(rutaDeLaUltimaLlamada().split('?')[1])
    expect(consulta.get('pagina')).toBe('2')
    expect(consulta.get('por_pagina')).toBe('10')
    expect(consulta.get('activo')).toBe('false')
    expect(consulta.get('area')).toBe('Datos')
  })

  it('no envía parámetros de búsqueda por nombre, puesto, competencia ni nivel', async () => {
    await listarEmpleados('token-rh', { pagina: 1 })

    const consulta = new URLSearchParams(rutaDeLaUltimaLlamada().split('?')[1])
    for (const noSoportado of ['q', 'nombre', 'puesto', 'competencia', 'nivel', 'search']) {
      expect(consulta.has(noSoportado)).toBe(false)
    }
  })

  it('devuelve la respuesta del backend sin transformarla', async () => {
    const respuesta = {
      total: 42,
      pagina: 1,
      por_pagina: 20,
      items: [
        { id: 1, nombre: 'Ana López', puesto: 'Analista', area: 'TI', activo: true },
        { id: 2, nombre: 'Luis Pérez', puesto: null, area: null, activo: false },
      ],
    }
    vi.mocked(solicitar).mockResolvedValue(respuesta)

    await expect(listarEmpleados('token-rh', {})).resolves.toEqual(respuesta)
  })

  it('propaga los errores de la capa existente con su estado HTTP', async () => {
    const error = Object.assign(new Error('no autorizado'), { estado: 401 })
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(listarEmpleados('token-rh', {})).rejects.toBe(error)
  })

  it('propaga un 500 para que la vista muestre su estado de error', async () => {
    const error = Object.assign(new Error('fallo del servidor'), { estado: 500 })
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(listarEmpleados('token-rh', {})).rejects.toBe(error)
  })
})

// ---------------------------------------------------------------------------
// Detalle (PRD §20.1): GET /api/v1/rh/employees/{id}, sin transformar.
// ---------------------------------------------------------------------------
describe('empleados — detalle por RH', () => {
  it('construye la URL con el empleadoId y envía el token', async () => {
    vi.mocked(solicitar).mockResolvedValue({ id: 7 })

    await obtenerEmpleado('token-rh', 7)

    expect(solicitar).toHaveBeenCalledTimes(1)
    expect(solicitar).toHaveBeenCalledWith('/api/v1/rh/employees/7', {
      token: 'token-rh',
    })
  })

  it('devuelve los datos del backend sin transformarlos', async () => {
    const respuesta = {
      id: 7,
      nombre: 'Ana López',
      puesto: 'Analista de datos',
      area: 'TI',
      fecha_ingreso: '2024-03-01',
      activo: true,
      cuenta: { email: 'ana@empresa.dev', rol: 'EMPLEADO' },
    }
    vi.mocked(solicitar).mockResolvedValue(respuesta)

    await expect(obtenerEmpleado('token-rh', 7)).resolves.toEqual(respuesta)
  })

  it('propaga el error del endpoint con su estado HTTP', async () => {
    const error = Object.assign(new Error('no encontrado'), { estado: 404 })
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(obtenerEmpleado('token-rh', 999)).rejects.toBe(error)
  })
})

// ---------------------------------------------------------------------------
// Resultado actual (PRD §9/§20.2; ET §31): GET /rh/employees/{id}/result.
// Solo lectura: sin transformación, sin ramas por estado del empleado.
// ---------------------------------------------------------------------------
describe('empleados — resultado actual por RH', () => {
  const RESULTADO = {
    empleado_id: 7,
    competencias: [
      { clave: 'desempeno_tecnico', estado: 'CALCULABLE', nivel: 5, valor: '100.00', etiqueta: 'Alto', evidencia: {} },
      { clave: 'liderazgo', estado: 'CALCULABLE', nivel: 3, valor: '60.00', etiqueta: 'En crecimiento', evidencia: {} },
      { clave: 'trabajo_equipo', estado: 'CALCULABLE', nivel: 5, valor: '100.00', etiqueta: 'Alto', evidencia: {} },
      { clave: 'comunicacion', estado: 'CALCULABLE', nivel: 5, valor: '100.00', etiqueta: 'Alto', evidencia: {} },
      { clave: 'aprendizaje', estado: 'CALCULABLE', nivel: 3, valor: '2.80', etiqueta: 'En crecimiento', evidencia: {} },
    ],
    experiencia: {
      fecha_ingreso: '2024-03-01',
      anios_antiguedad: '2.55',
      proyectos_unicos: 3,
    },
    fortalezas: ['desempeno_tecnico', 'trabajo_equipo', 'comunicacion'],
    oportunidades: [],
  }

  it('llama a GET /api/v1/rh/employees/{id}/result con el token de la sesión', async () => {
    vi.mocked(solicitar).mockResolvedValue(RESULTADO)

    await obtenerResultadoActual('token-rh', 7)

    expect(solicitar).toHaveBeenCalledTimes(1)
    expect(solicitar).toHaveBeenCalledWith('/api/v1/rh/employees/7/result', {
      token: 'token-rh',
    })
  })

  it('construye la URL con el empleadoId y sin parámetros extra', async () => {
    vi.mocked(solicitar).mockResolvedValue(RESULTADO)

    await obtenerResultadoActual('token-rh', 42)

    const [ruta, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(ruta).toBe('/api/v1/rh/employees/42/result')
    expect(ruta).not.toContain('?')
    expect(opciones).toEqual({ token: 'token-rh' })
    expect(opciones.metodo).toBeUndefined()
  })

  it('devuelve la respuesta del backend sin transformarla', async () => {
    vi.mocked(solicitar).mockResolvedValue(RESULTADO)

    await expect(obtenerResultadoActual('token-rh', 7)).resolves.toEqual(RESULTADO)
  })

  it('conserva los estados DI con nivel nulo sin interpretarlos', async () => {
    const conDi = {
      ...RESULTADO,
      competencias: RESULTADO.competencias.map((competencia) =>
        competencia.clave === 'comunicacion'
          ? { clave: 'comunicacion', estado: 'INSUFFICIENT_DATA', nivel: null, valor: null, etiqueta: null, evidencia: {} }
          : competencia,
      ),
    }
    vi.mocked(solicitar).mockResolvedValue(conDi)

    const respuesta = await obtenerResultadoActual('token-rh', 7)

    const comunicacion = respuesta.competencias.find((c) => c.clave === 'comunicacion')
    expect(comunicacion.estado).toBe('INSUFFICIENT_DATA')
    expect(comunicacion.nivel).toBeNull()
    expect(comunicacion.etiqueta).toBeNull()
  })

  it('propaga los errores de la capa existente con su estado HTTP', async () => {
    const error = Object.assign(new Error('no encontrado'), { estado: 404 })
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(obtenerResultadoActual('token-rh', 999)).rejects.toBe(error)
  })

  it('propaga un 500 para que la vista muestre su estado de error', async () => {
    const error = Object.assign(new Error('fallo del servidor'), { estado: 500 })
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(obtenerResultadoActual('token-rh', 7)).rejects.toBe(error)
  })

  it('propaga un 401 sin transformarlo (la vista decide la sesión expirada)', async () => {
    const error = Object.assign(new Error('Credenciales inválidas.'), { estado: 401 })
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(obtenerResultadoActual('token-rh', 7)).rejects.toBe(error)
  })
})
