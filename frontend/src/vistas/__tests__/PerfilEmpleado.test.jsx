// Perfil individual RH: información básica + última evaluación + historial
// (PRD §20.2; Style Guide §6, §7, §19 Timeline). La API se mockea: sin
// llamadas reales al backend.
//
// Qué se verifica aquí:
// - estado de carga de las tres consultas;
// - información básica del EmpleadoOut, sin resultados ni competencias actuales;
// - última evaluación histórica: periodo, fecha, competencias snapshot,
//   9-Box histórico, DI neutral, sin generado_por_cuenta_id;
// - historial paginado: timeline con snapshots tal cual, sin deduplicar la
//   más reciente, paginación del contrato, error/reintento propio;
// - estados vacío/error/401 propios de cada sección, sin romper la básica;
// - apertura desde una fila sin recargar el catálogo;
// - volver al listado sin consultas extra.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listarEmpleados, obtenerEmpleado, POR_PAGINA_DEFECTO } from '../../api/empleados.js'
import {
  listarEvaluacionesEmpleado,
  POR_PAGINA_DEFECTO as POR_PAGINA_EVALUACIONES,
} from '../../api/evaluaciones.js'
import Empleados from '../Empleados.jsx'
import PerfilEmpleado from '../PerfilEmpleado.jsx'

vi.mock('../../api/empleados.js', async () => {
  const original = await vi.importActual('../../api/empleados.js')
  return {
    ...original,
    listarEmpleados: vi.fn(),
    crearEmpleado: vi.fn(),
    obtenerEmpleado: vi.fn(),
  }
})

vi.mock('../../api/evaluaciones.js', async () => {
  const original = await vi.importActual('../../api/evaluaciones.js')
  return {
    ...original,
    listarEvaluacionesEmpleado: vi.fn(),
  }
})

const EMPLEADOS = [
  { id: 1, nombre: 'Ana López', puesto: 'Analista de datos', area: 'TI', activo: true },
  { id: 2, nombre: 'Luis Pérez', puesto: 'Desarrollador', area: null, activo: false },
]

function pagina(items) {
  return { total: items.length, pagina: 1, por_pagina: POR_PAGINA_DEFECTO, items }
}

const DETALLE = {
  id: 1,
  nombre: 'Ana López',
  puesto: 'Analista de datos',
  area: 'TI',
  fecha_ingreso: '2024-03-01',
  activo: true,
  cuenta: {
    email: 'ana@empresa.dev',
    rol: 'EMPLEADO',
    activo: true,
    must_change_password: false,
  },
}

// Última evaluación oficial (EvaluacionOut): items[0] del historial con
// pagina=1&por_pagina=1. Snapshot histórico, con una competencia en DI.
const EVALUACION = {
  id: 11,
  empleado_id: 1,
  periodo: '2026-Q3',
  competencias: [
    { clave: 'desempeno_tecnico', nivel: 3, status: 'CALCULABLE' },
    { clave: 'liderazgo', nivel: 2, status: 'CALCULABLE' },
    { clave: 'trabajo_equipo', nivel: 4, status: 'CALCULABLE' },
    { clave: 'comunicacion', nivel: null, status: 'INSUFFICIENT_DATA' },
    { clave: 'aprendizaje', nivel: 5, status: 'CALCULABLE' },
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
}

function paginaEvaluacion(items = [EVALUACION]) {
  return { total: items.length, pagina: 1, por_pagina: 1, items }
}

// Entradas MÁS ANTIGUAS del historial (misma forma EvaluacionOut). Los
// valores de nine_box son los que el snapshot entrega; nunca texto fijo.
const EVALUACION_MEDIA = {
  id: 7,
  empleado_id: 1,
  periodo: '2026-Q2',
  competencias: [
    { clave: 'desempeno_tecnico', nivel: 2, status: 'CALCULABLE' },
    { clave: 'liderazgo', nivel: null, status: 'INSUFFICIENT_DATA' },
    { clave: 'trabajo_equipo', nivel: 3, status: 'CALCULABLE' },
    { clave: 'comunicacion', nivel: 2, status: 'CALCULABLE' },
    { clave: 'aprendizaje', nivel: 4, status: 'CALCULABLE' },
  ],
  generado_en: '2026-06-15T09:00:00.000000+00:00',
  generado_por_cuenta_id: 2,
  nine_box: {
    performance_axis: null,
    potential_axis: null,
    box_code: null,
    etiqueta_performance: null,
    etiqueta_potencial: null,
  },
}

const EVALUACION_ANTIGUA = {
  id: 4,
  empleado_id: 1,
  periodo: '2025-Q4',
  competencias: [
    { clave: 'desempeno_tecnico', nivel: 2, status: 'CALCULABLE' },
    { clave: 'liderazgo', nivel: 1, status: 'CALCULABLE' },
    { clave: 'trabajo_equipo', nivel: 2, status: 'CALCULABLE' },
    { clave: 'comunicacion', nivel: 3, status: 'CALCULABLE' },
    { clave: 'aprendizaje', nivel: 2, status: 'CALCULABLE' },
  ],
  generado_en: '2025-12-15T10:00:00.000000+00:00',
  generado_por_cuenta_id: 2,
  nine_box: {
    performance_axis: 2.4,
    potential_axis: 3.5,
    box_code: 'B3',
    etiqueta_performance: 'Medio',
    etiqueta_potencial: 'Medio',
  },
}

function paginaHistorial(items = [EVALUACION_MEDIA, EVALUACION_ANTIGUA], total = items.length) {
  return { total, pagina: 1, por_pagina: POR_PAGINA_EVALUACIONES, items }
}

// El mock despacha por `porPagina`: 1 → Última evaluación, 20 → Historial.
// Los tests reasignan `respuestaUltima` / `respuestaHistorial` cuando lo
// necesitan.
let respuestaUltima = () => Promise.resolve(paginaEvaluacion())
let respuestaHistorial = () => Promise.resolve(paginaHistorial())

/** Llamadas registradas del mock que corresponden a UNA consulta. */
function llamadasDe(porPagina) {
  return vi.mocked(listarEvaluacionesEmpleado).mock.calls.filter(
    ([, , opciones]) => opciones?.porPagina === porPagina,
  )
}

/** Scope de una tarjeta del perfil por el título de su encabezado. */
function tarjeta(titulo) {
  return within(screen.getByRole('heading', { name: titulo }).closest('section'))
}

beforeEach(() => {
  respuestaUltima = () => Promise.resolve(paginaEvaluacion())
  respuestaHistorial = () => Promise.resolve(paginaHistorial())
  vi.mocked(listarEmpleados).mockReset()
  vi.mocked(obtenerEmpleado).mockReset()
  vi.mocked(listarEvaluacionesEmpleado).mockReset()
  vi.mocked(listarEvaluacionesEmpleado).mockImplementation((_token, _id, opciones = {}) =>
    opciones?.porPagina === 1 ? respuestaUltima() : respuestaHistorial(),
  )
  vi.mocked(listarEmpleados).mockResolvedValue(pagina(EMPLEADOS))
  vi.mocked(obtenerEmpleado).mockResolvedValue(DETALLE)
})

describe('PerfilEmpleado — información básica', () => {
  it('muestra un estado de carga antes de resolver la consulta', () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(screen.getByText('Cargando información del empleado…')).toBeInTheDocument()
  })

  it('muestra la información básica del empleado', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(await screen.findByText('Información básica')).toBeInTheDocument()
    expect(screen.getByText('ana@empresa.dev')).toBeInTheDocument()
    expect(screen.getByText('EMPLEADO')).toBeInTheDocument()
    expect(screen.getByText('1 de marzo de 2024')).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
  })

  it('presenta las fechas en lectura humana, no como dato técnico', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await screen.findByText('Información básica')

    expect(screen.queryByText('2024-03-01')).not.toBeInTheDocument()
  })

  it('no adelanta partes del perfil que aún no existen', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await screen.findByText('Información básica')

    // La última evaluación histórica SÍ existe ahora; lo que sigue prohibido
    // es adelantar resultado actual, evolución, fortalezas/oportunidades,
    // recomendación IA o un 9-Box "actual" independiente.
    expect(screen.queryByText(/resultado actual/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/evoluci/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/fortalezas/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/oportunidades/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/recomendaci/i)).not.toBeInTheDocument()
    expect(screen.queryByText('9-Box actual')).not.toBeInTheDocument()
  })

  it('muestra un estado neutral ante un 404 con opción de volver', async () => {
    const alVolver = vi.fn()
    vi.mocked(obtenerEmpleado).mockRejectedValueOnce(
      Object.assign(new Error('no encontrado'), { estado: 404 }),
    )
    render(
      <PerfilEmpleado token="token-rh" empleadoId={999} alVolver={alVolver} />,
    )

    expect(
      await screen.findByText('Este empleado no está disponible.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('No pudimos cargar la información del empleado'),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Volver al listado' })[0])
    expect(alVolver).toHaveBeenCalledTimes(1)
  })

  it('cierra la sesión ante un 401 sin mostrar un estado de error', async () => {
    const alSesionExpirada = vi.fn()
    vi.mocked(obtenerEmpleado).mockRejectedValue(
      Object.assign(new Error('Credenciales inválidas.'), { estado: 401 }),
    )
    render(
      <PerfilEmpleado
        token="token-rh"
        empleadoId={1}
        alVolver={() => {}}
        alSesionExpirada={alSesionExpirada}
      />,
    )

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(
      screen.queryByText('No pudimos cargar la información del empleado'),
    ).not.toBeInTheDocument()
  })
})

describe('Empleados — acceso al perfil individual', () => {
  it('abre el perfil desde una fila con una sola consulta', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.click(screen.getByRole('button', { name: 'Ana López' }))

    await screen.findByText('Información básica')
    await waitFor(() => expect(obtenerEmpleado).toHaveBeenCalledTimes(1))
    expect(vi.mocked(obtenerEmpleado).mock.calls[0]).toEqual(['token-rh', 1])
    expect(screen.getByText('ana@empresa.dev')).toBeInTheDocument()
  })

  it('vuelve al listado sin recargar el catálogo', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')
    const llamadasListado = vi.mocked(listarEmpleados).mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Ana López' }))
    await screen.findByText('Información básica')

    fireEvent.click(screen.getAllByRole('button', { name: 'Volver al listado' })[0])

    expect(await screen.findByText('Ana López')).toBeInTheDocument()
    expect(screen.queryByText('Información básica')).not.toBeInTheDocument()
    expect(vi.mocked(listarEmpleados).mock.calls).toHaveLength(llamadasListado)
  })
})

describe('PerfilEmpleado — última evaluación', () => {
  it('muestra un estado de carga propio antes de resolver la consulta', async () => {
    respuestaUltima = () => new Promise(() => {})

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    // La sección se monta con la información básica ya resuelta; la consulta
    // de evaluaciones sigue pendiente con su propio estado de carga.
    expect(await screen.findByText('Última evaluación')).toBeInTheDocument()
    expect(screen.getByText('Cargando última evaluación…')).toBeInTheDocument()
  })

  it('consulta la última evaluación con pagina=1 y porPagina=1 exactamente una vez', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await screen.findByText('2026-Q3')

    expect(llamadasDe(1)).toHaveLength(1)
    expect(llamadasDe(1)[0]).toEqual(['token-rh', 1, { pagina: 1, porPagina: 1 }])
  })

  it('muestra periodo, fecha de generación y cinco competencias históricas', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(await screen.findByText('2026-Q3')).toBeInTheDocument()
    const ultima = tarjeta('Última evaluación')
    expect(ultima.getByText('20 de septiembre de 2026')).toBeInTheDocument()
    expect(screen.queryByText('2026-09-20')).not.toBeInTheDocument()

    const nombres = [
      'Desempeño técnico',
      'Liderazgo',
      'Trabajo en equipo',
      'Comunicación',
      'Capacidad de aprendizaje',
    ]
    for (const nombre of nombres) {
      expect(ultima.getByText(nombre)).toBeInTheDocument()
    }
    expect(ultima.getByText('Nivel 3')).toBeInTheDocument()
    expect(ultima.getByText('Nivel 5')).toBeInTheDocument()
  })

  it('muestra Datos insuficientes sin convertir DI en 0', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await screen.findByText('2026-Q3')

    expect(tarjeta('Última evaluación').getByText('— Datos insuficientes')).toBeInTheDocument()
  })

  it('muestra el 9-Box del snapshot histórico', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await screen.findByText('2026-Q3')

    expect(screen.getByText('9-Box histórico')).toBeInTheDocument()
    expect(screen.getByText('3.2 · Fuerte')).toBeInTheDocument()
    expect(screen.getByText('4.1 · Alto')).toBeInTheDocument()
    expect(screen.getByText('B6')).toBeInTheDocument()
  })

  it('muestra Datos insuficientes cuando el snapshot 9-Box quedó vacío', async () => {
    respuestaUltima = () =>
      Promise.resolve(
        paginaEvaluacion([
          {
            ...EVALUACION,
            nine_box: {
              performance_axis: null,
              potential_axis: null,
              box_code: null,
              etiqueta_performance: null,
              etiqueta_potencial: null,
            },
          },
        ]),
      )

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await screen.findByText('2026-Q3')

    expect(tarjeta('Última evaluación').getByText('Datos insuficientes.')).toBeInTheDocument()
  })

  it('no muestra generado_por_cuenta_id', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await screen.findByText('2026-Q3')

    expect(screen.queryByText(/generado_por/i)).not.toBeInTheDocument()
    expect(screen.queryByText('4')).not.toBeInTheDocument()
  })

  it('muestra un estado vacío neutral cuando no hay evaluaciones', async () => {
    respuestaUltima = () => Promise.resolve(paginaEvaluacion([]))
    respuestaHistorial = () =>
      Promise.resolve({
        total: 0,
        pagina: 1,
        por_pagina: POR_PAGINA_EVALUACIONES,
        items: [],
      })

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(
      await screen.findByText(
        'Todavía no hay evaluaciones oficiales para este empleado.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Información básica')).toBeInTheDocument()
    // Con total=0 la tarjeta Historial NO se renderiza: el empty state ya
    // vive en Última evaluación (decisión aprobada del micro-bloque).
    expect(screen.queryByText('Historial de evaluaciones')).not.toBeInTheDocument()
    // El único "Volver al listado" es el superior: el inferior de la tarjeta
    // de Última evaluación se eliminó (la navegación superior basta).
    expect(
      screen.getAllByRole('button', { name: 'Volver al listado' }),
    ).toHaveLength(1)
  })

  it('muestra error y permite reintentar sin destruir la información básica', async () => {
    let fallos = 0
    respuestaUltima = () =>
      fallos++ === 0
        ? Promise.reject(Object.assign(new Error('fallo del servidor'), { estado: 500 }))
        : Promise.resolve(paginaEvaluacion())

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(
      await screen.findByText('No pudimos cargar la última evaluación'),
    ).toBeInTheDocument()
    expect(screen.getByText('Información básica')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    expect(await screen.findByText('2026-Q3')).toBeInTheDocument()
    expect(llamadasDe(1)).toHaveLength(2)
  })

  it('cierra la sesión ante un 401 sin mostrar un estado de error', async () => {
    const alSesionExpirada = vi.fn()
    respuestaUltima = () =>
      Promise.reject(Object.assign(new Error('Credenciales inválidas.'), { estado: 401 }))

    render(
      <PerfilEmpleado
        token="token-rh"
        empleadoId={1}
        alVolver={() => {}}
        alSesionExpirada={alSesionExpirada}
      />,
    )

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(
      screen.queryByText('No pudimos cargar la última evaluación'),
    ).not.toBeInTheDocument()
  })

  it('no provoca una nueva llamada al catálogo de empleados', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await screen.findByText('2026-Q3')

    expect(listarEmpleados).not.toHaveBeenCalled()
  })
})

describe('PerfilEmpleado — historial de evaluaciones', () => {
  it('muestra un estado de carga propio antes de resolver la consulta', async () => {
    respuestaHistorial = () => new Promise(() => {})

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(await screen.findByText('Historial de evaluaciones')).toBeInTheDocument()
    expect(screen.getByText('Cargando historial de evaluaciones…')).toBeInTheDocument()
  })

  it('consulta el historial con la página completa del contrato una vez', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await screen.findByText('2026-Q2')

    expect(llamadasDe(POR_PAGINA_EVALUACIONES)).toHaveLength(1)
    expect(llamadasDe(POR_PAGINA_EVALUACIONES)[0]).toEqual([
      'token-rh',
      1,
      { pagina: 1, porPagina: POR_PAGINA_EVALUACIONES },
    ])
  })

  it('muestra cada entrada con periodo y fecha legible, sin fecha técnica', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await screen.findByText('Historial de evaluaciones')
    const historial = tarjeta('Historial de evaluaciones')

    expect(historial.getByText('2026-Q2')).toBeInTheDocument()
    expect(historial.getByText(/15 de junio de 2026/)).toBeInTheDocument()
    expect(historial.getByText('2025-Q4')).toBeInTheDocument()
    expect(historial.getByText(/15 de diciembre de 2025/)).toBeInTheDocument()
    expect(screen.queryByText('2026-06-15')).not.toBeInTheDocument()
    expect(screen.queryByText('2025-12-15')).not.toBeInTheDocument()
  })

  it('muestra niveles históricos y Datos insuficientes por entrada', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await screen.findByText('Historial de evaluaciones')
    const historial = tarjeta('Historial de evaluaciones')

    expect(historial.getAllByText('Nivel 2').length).toBeGreaterThan(0)
    expect(historial.getAllByText('— Datos insuficientes').length).toBeGreaterThan(0)
  })

  it('muestra el 9-Box de cada snapshot con sus valores reales, o DI si quedó vacío', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await screen.findByText('Historial de evaluaciones')
    const historial = tarjeta('Historial de evaluaciones')

    expect(
      historial.getByText(
        '9-Box — Rendimiento 2.4 · Medio / Potencial 3.5 · Medio / Celda B3',
      ),
    ).toBeInTheDocument()
    expect(historial.getByText('9-Box — Datos insuficientes.')).toBeInTheDocument()
  })

  it('no deduplica la evaluación más reciente: aparece en ambas tarjetas', async () => {
    respuestaHistorial = () =>
      Promise.resolve(paginaHistorial([EVALUACION, EVALUACION_ANTIGUA]))

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await screen.findByText('Historial de evaluaciones')

    expect(screen.getAllByText('2026-Q3')).toHaveLength(2)
  })

  it('no muestra generado_por_cuenta_id en las entradas', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await screen.findByText('Historial de evaluaciones')

    expect(screen.queryByText(/generado_por/i)).not.toBeInTheDocument()
  })

  it('pagina con el total del contrato: una llamada por cambio de página', async () => {
    respuestaHistorial = () =>
      Promise.resolve(paginaHistorial([EVALUACION_MEDIA, EVALUACION_ANTIGUA], 25))

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(await screen.findByText(/Mostrando/)).toBeInTheDocument()
    expect(screen.getByText('25')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Página 2' }))

    await waitFor(() =>
      expect(llamadasDe(POR_PAGINA_EVALUACIONES)).toHaveLength(2),
    )
    expect(llamadasDe(POR_PAGINA_EVALUACIONES)[1]).toEqual([
      'token-rh',
      1,
      { pagina: 2, porPagina: POR_PAGINA_EVALUACIONES },
    ])
  })

  it('muestra error propio y reintenta la página actual sin romper las otras secciones', async () => {
    let fallos = 0
    respuestaHistorial = () =>
      fallos++ === 0
        ? Promise.reject(Object.assign(new Error('fallo del servidor'), { estado: 500 }))
        : Promise.resolve(paginaHistorial())

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(
      await screen.findByText('No pudimos cargar el historial de evaluaciones'),
    ).toBeInTheDocument()
    expect(screen.getByText('Información básica')).toBeInTheDocument()
    expect(screen.getByText('2026-Q3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    expect(await screen.findByText('2026-Q2')).toBeInTheDocument()
    expect(llamadasDe(POR_PAGINA_EVALUACIONES)).toHaveLength(2)
    // El reintento pide la MISMA página actual, no vuelve arbitrariamente a 1.
    expect(llamadasDe(POR_PAGINA_EVALUACIONES)[1][2]).toEqual({
      pagina: 1,
      porPagina: POR_PAGINA_EVALUACIONES,
    })
  })

  it('cierra la sesión ante un 401 del historial sin estado de error', async () => {
    const alSesionExpirada = vi.fn()
    respuestaHistorial = () =>
      Promise.reject(Object.assign(new Error('Credenciales inválidas.'), { estado: 401 }))

    render(
      <PerfilEmpleado
        token="token-rh"
        empleadoId={1}
        alVolver={() => {}}
        alSesionExpirada={alSesionExpirada}
      />,
    )

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(
      screen.queryByText('No pudimos cargar el historial de evaluaciones'),
    ).not.toBeInTheDocument()
  })
})
