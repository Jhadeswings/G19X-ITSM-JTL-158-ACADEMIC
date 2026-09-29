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
import { listarEmpleados, obtenerEmpleado, obtenerResultadoActual, POR_PAGINA_DEFECTO } from '../../api/empleados.js'
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
    obtenerResultadoActual: vi.fn(),
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

/**
 * Igual que `tarjeta`, pero ESPERA a que la tarjeta exista.
 *
 * Mismo selector y mismo scoping (encabezado → `section` → `within`); solo
 * espera de forma asíncrona. Necesario porque "Resultado actual" y
 * "Competencias" muestran ambos la lectura "Nivel 5 · Alto": una búsqueda
 * global `screen.findByText` exige unicidad y fallaría. Acotar la espera al
 * bloque correcto no cambia la expectativa funcional, solo su alcance.
 */
async function esperarTarjeta(titulo) {
  const encabezado = await screen.findByRole('heading', { name: titulo })
  return within(encabezado.closest('section'))
}

// Resultado actual vigente (ResultadoActualDTO). A propósito usa `estado` y
// `etiqueta` — NO `status` como el snapshot histórico — e incluye campos que
// el bloque NO debe mostrar (valor, evidencia, experiencia, fortalezas,
// oportunidades) para poder verificar que se ignoran.
const RESULTADO_ACTUAL = {
  empleado_id: 1,
  competencias: [
    { clave: 'desempeno_tecnico', estado: 'CALCULABLE', nivel: 5, valor: '100.00', evidencia: { proyectos_completados: 3 }, etiqueta: 'Alto' },
    { clave: 'liderazgo', estado: 'CALCULABLE', nivel: 4, valor: '80.00', evidencia: { participaciones: 3 }, etiqueta: 'Consolidado' },
    { clave: 'trabajo_equipo', estado: 'CALCULABLE', nivel: 3, valor: '60.00', evidencia: { participaciones: 3 }, etiqueta: 'En crecimiento' },
    { clave: 'comunicacion', estado: 'CALCULABLE', nivel: 2, valor: '40.00', evidencia: { participaciones: 3 }, etiqueta: 'En desarrollo' },
    { clave: 'aprendizaje', estado: 'CALCULABLE', nivel: 1, valor: '1.40', evidencia: { proyectos_unicos: 1 }, etiqueta: 'Inicial' },
  ],
  experiencia: {
    fecha_ingreso: '2024-03-01',
    anios_antiguedad: '2.55',
    proyectos_unicos: 3,
  },
  fortalezas: ['desempeno_tecnico', 'liderazgo'],
  oportunidades: ['comunicacion', 'aprendizaje'],
}

/** Resultado actual con UNA competencia en DI (parcial). */
function resultadoActualDiParcial() {
  return {
    ...RESULTADO_ACTUAL,
    competencias: RESULTADO_ACTUAL.competencias.map((competencia) =>
      competencia.clave === 'comunicacion'
        ? { clave: 'comunicacion', estado: 'INSUFFICIENT_DATA', nivel: null, valor: null, evidencia: {}, etiqueta: null }
        : competencia,
    ),
  }
}

/** Resultado actual con las CINCO competencias en DI (total). */
function resultadoActualDiTotal() {
  return {
    ...RESULTADO_ACTUAL,
    competencias: RESULTADO_ACTUAL.competencias.map((competencia) => ({
      ...competencia,
      estado: 'INSUFFICIENT_DATA',
      nivel: null,
      valor: null,
      evidencia: {},
      etiqueta: null,
    })),
  }
}

/**
 * Experiencia (PRD §8) con contexto controlado. Se apoya en el
 * `RESULTADO_ACTUAL` base: solo cambia el bloque `experiencia`, que es lo que
 * se quiere variar (antigüedad nula, cero o normal).
 */
function resultadoActualConExperiencia(experiencia) {
  return { ...RESULTADO_ACTUAL, experiencia }
}

let respuestaResultado = () => Promise.resolve(RESULTADO_ACTUAL)

beforeEach(() => {
  respuestaUltima = () => Promise.resolve(paginaEvaluacion())
  respuestaHistorial = () => Promise.resolve(paginaHistorial())
  respuestaResultado = () => Promise.resolve(RESULTADO_ACTUAL)
  vi.mocked(listarEmpleados).mockReset()
  vi.mocked(obtenerEmpleado).mockReset()
  vi.mocked(obtenerResultadoActual).mockReset()
  vi.mocked(obtenerResultadoActual).mockImplementation(() => respuestaResultado())
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

    // La última evaluación histórica SÍ existe ahora, y Resultado actual es
    // el bloque aprobado de esta fase; lo que sigue prohibido es adelantar
    // evolución, fortalezas/oportunidades, recomendación IA o un 9-Box
    // "actual" independiente.
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

// ---------------------------------------------------------------------------
// Resultado actual (PRD §9/§20.2; ET §42): bloque compacto con las cinco
// competencias del estado PRESENTE. Distinto del snapshot de "Última
// evaluación": aquí `estado`/`etiqueta`, nunca `status`. Sin evidencia,
// experiencia, 9-Box, IA ni indicadores ajenos al contrato.
// ---------------------------------------------------------------------------
describe('PerfilEmpleado — resultado actual', () => {
  it('consulta el resultado actual exactamente una vez con token y empleadoId', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(
      await screen.findByRole('heading', { name: 'Resultado actual' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(obtenerResultadoActual).toHaveBeenCalledTimes(1))
    expect(vi.mocked(obtenerResultadoActual).mock.calls[0]).toEqual(['token-rh', 1])
  })

  it('muestra su estado de carga propio sin bloquear la información básica', async () => {
    respuestaResultado = () => new Promise(() => {})

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(await screen.findByText('Información básica')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Resultado actual' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Cargando resultado actual…')).toBeInTheDocument()
    // El resto del perfil no depende de esta consulta pendiente.
    expect(screen.getByText('Última evaluación')).toBeInTheDocument()
  })

  it('muestra las cinco competencias en el orden contractual del backend', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(
      (await esperarTarjeta('Resultado actual')).getByText('Nivel 5 · Alto'),
    ).toBeInTheDocument()

    const nombres = tarjeta('Resultado actual')
      .getAllByRole('term')
      .map((nodo) => nodo.textContent)
    expect(nombres).toEqual([
      'Desempeño técnico',
      'Liderazgo',
      'Trabajo en equipo',
      'Comunicación',
      'Capacidad de aprendizaje',
    ])
  })

  it('muestra "Nivel X · Etiqueta" para cada competencia CALCULABLE', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(
      (await esperarTarjeta('Resultado actual')).getByText('Nivel 5 · Alto'),
    ).toBeInTheDocument()
    const seccion = tarjeta('Resultado actual')
    for (const lectura of [
      'Nivel 5 · Alto',
      'Nivel 4 · Consolidado',
      'Nivel 3 · En crecimiento',
      'Nivel 2 · En desarrollo',
      'Nivel 1 · Inicial',
    ]) {
      expect(seccion.getByText(lectura)).toBeInTheDocument()
    }
    expect(seccion.queryByText('— Datos insuficientes')).not.toBeInTheDocument()
  })


  it('muestra DI parcial como texto neutro sin convertirlo en 0', async () => {
    respuestaResultado = () => Promise.resolve(resultadoActualDiParcial())

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(
      (await esperarTarjeta('Resultado actual')).getByText('Nivel 5 · Alto'),
    ).toBeInTheDocument()
    const seccion = tarjeta('Resultado actual')
    expect(seccion.getAllByText('— Datos insuficientes')).toHaveLength(1)
    // Las competencias calculables siguen mostrando su lectura completa.
    expect(seccion.getByText('Nivel 1 · Inicial')).toBeInTheDocument()
    expect(seccion.getByText('Nivel 4 · Consolidado')).toBeInTheDocument()
    expect(seccion.queryByText('Nivel 0')).not.toBeInTheDocument()
    expect(seccion.queryByText(/0 ·/)).not.toBeInTheDocument()
    // DI neutro: jamás un estado de error dentro del bloque.
    expect(
      seccion.queryByText('No pudimos cargar el resultado actual'),
    ).not.toBeInTheDocument()
  })

  it('muestra las cinco competencias en DI cuando todas carecen de evidencia', async () => {
    respuestaResultado = () => Promise.resolve(resultadoActualDiTotal())

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(await screen.findByText('Información básica')).toBeInTheDocument()
    const seccion = tarjeta('Resultado actual')
    expect(seccion.getAllByText('— Datos insuficientes')).toHaveLength(5)
    expect(seccion.queryByText(/Nivel/)).not.toBeInTheDocument()
    expect(seccion.queryByText('Nivel 0')).not.toBeInTheDocument()
    // DI total es estado válido: la tarjeta existe y no es un error.
    expect(
      screen.queryByText('No pudimos cargar el resultado actual'),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Última evaluación')).toBeInTheDocument()
  })

  it('muestra error propio y el reintento repite únicamente su consulta', async () => {
    let fallos = 0
    respuestaResultado = () =>
      fallos++ === 0
        ? Promise.reject(Object.assign(new Error('fallo del servidor'), { estado: 500 }))
        : Promise.resolve(RESULTADO_ACTUAL)

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(
      await screen.findByText('No pudimos cargar el resultado actual'),
    ).toBeInTheDocument()
    // Las demás secciones siguen intactas durante el error.
    expect(screen.getByText('Información básica')).toBeInTheDocument()
    expect(screen.getByText('2026-Q3')).toBeInTheDocument()

    const evaluacionesAntes =
      llamadasDe(1).length + llamadasDe(POR_PAGINA_EVALUACIONES).length
    const basicasAntes = vi.mocked(obtenerEmpleado).mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    expect(
      (await esperarTarjeta('Resultado actual')).getByText('Nivel 5 · Alto'),
    ).toBeInTheDocument()
    expect(obtenerResultadoActual).toHaveBeenCalledTimes(2)
    expect(vi.mocked(obtenerResultadoActual).mock.calls[1]).toEqual(['token-rh', 1])
    // El retry NO reejecuta información básica ni evaluaciones.
    expect(
      llamadasDe(1).length + llamadasDe(POR_PAGINA_EVALUACIONES).length,
    ).toBe(evaluacionesAntes)
    expect(vi.mocked(obtenerEmpleado).mock.calls.length).toBe(basicasAntes)
  })


  it('cierra la sesión ante un 401 sin mostrar un estado de error', async () => {
    const alSesionExpirada = vi.fn()
    respuestaResultado = () =>
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
      screen.queryByText('No pudimos cargar el resultado actual'),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Información básica')).toBeInTheDocument()
  })

  it('queda antes de Última evaluación sin bloquear las otras secciones', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(
      (await esperarTarjeta('Resultado actual')).getByText('Nivel 5 · Alto'),
    ).toBeInTheDocument()
    expect(screen.getByText('Información básica')).toBeInTheDocument()
    expect(screen.getByText('2026-Q3')).toBeInTheDocument()
    expect(screen.getByText('Historial de evaluaciones')).toBeInTheDocument()

    const encabezados = screen.getAllByRole('heading').map((h) => h.textContent)
    expect(encabezados.indexOf('Resultado actual')).toBeGreaterThan(
      encabezados.indexOf('Información básica'),
    )
    expect(encabezados.indexOf('Resultado actual')).toBeLessThan(
      encabezados.indexOf('Última evaluación'),
    )
  })

  it('no muestra evidencia, "¿Cómo se obtiene?" ni valor/porcentaje en el bloque', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(
      (await esperarTarjeta('Resultado actual')).getByText('Nivel 5 · Alto'),
    ).toBeInTheDocument()
    const seccion = tarjeta('Resultado actual')

    expect(seccion.queryByText(/evidencia/i)).not.toBeInTheDocument()
    expect(seccion.queryByText(/Cómo se obtiene/i)).not.toBeInTheDocument()
    expect(seccion.queryByText(/%/)).not.toBeInTheDocument()
    // `valor` y contadores de `evidencia` llegan en el DTO pero no se pintan.
    for (const crudo of [
      '100.00',
      '80.00',
      '60.00',
      '40.00',
      '1.40',
      'proyectos_completados',
      'participaciones',
      'proyectos_unicos',
    ]) {
      expect(seccion.queryByText(crudo)).not.toBeInTheDocument()
    }
  })

  it('no muestra experiencia, fortalezas, oportunidades ni 9-Box en el bloque', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(
      (await esperarTarjeta('Resultado actual')).getByText('Nivel 5 · Alto'),
    ).toBeInTheDocument()
    const seccion = tarjeta('Resultado actual')

    expect(seccion.queryByText(/experiencia/i)).not.toBeInTheDocument()
    expect(seccion.queryByText(/antigüedad/i)).not.toBeInTheDocument()
    expect(seccion.queryByText(/fortalezas/i)).not.toBeInTheDocument()
    expect(seccion.queryByText(/oportunidades/i)).not.toBeInTheDocument()
    expect(seccion.queryByText(/9-Box/i)).not.toBeInTheDocument()
    expect(seccion.queryByText('2024-03-01')).not.toBeInTheDocument()
    expect(seccion.queryByText('2.55')).not.toBeInTheDocument()
    // Fuera del bloque, el 9-Box del snapshot histórico sí continúa presente.
    expect(screen.getByText('9-Box histórico')).toBeInTheDocument()
  })

  it('no muestra IA, recomendaciones, ranking, score global ni "de 5"', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(
      (await esperarTarjeta('Resultado actual')).getByText('Nivel 5 · Alto'),
    ).toBeInTheDocument()
    const seccion = tarjeta('Resultado actual')

    expect(seccion.queryByText(/recomendaci/i)).not.toBeInTheDocument()
    expect(seccion.queryByText(/\bIA\b/)).not.toBeInTheDocument()
    expect(seccion.queryByText(/ranking/i)).not.toBeInTheDocument()
    expect(seccion.queryByText(/score/i)).not.toBeInTheDocument()
    expect(seccion.queryByText(/promedio/i)).not.toBeInTheDocument()
    expect(seccion.queryByText(/de 5/i)).not.toBeInTheDocument()
    expect(seccion.queryByText(/porcentaje/i)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Competencias (SG §15.1): la evidencia breve que sustenta los resultados de
// "Resultado actual" (decisión de producto para el MVP, no frase literal del
// PRD). Este bloque NO tiene consulta, carga ni error propios: se alimenta del
// MISMO `resultado.datos` ya cargado, así que no se mockea nada nuevo.
// ---------------------------------------------------------------------------

/**
 * Evidencia realista de una competencia CALCULABLE, tal como la envía el
 * backend (`competency_engine.py`): para aprendizaje llegan TAMBIÉN campos sin
 * etiqueta en `ETIQUETAS_EVIDENCIA` (score, componentes A/B, año calendario).
 * Sirve para comprobar que el bloque solo pinta lo que tiene etiqueta.
 */
function resultadoActualConEvidenciaCompleta() {
  return {
    ...RESULTADO_ACTUAL,
    competencias: RESULTADO_ACTUAL.competencias.map((competencia) => {
      if (competencia.clave === 'aprendizaje') {
        return {
          ...competencia,
          evidencia: {
            roles_distintos: 2,
            proyectos_unicos: 3,
            capacitaciones_registradas: 4,
            anio_calendario: 2026,
            cursos_completados_anio: 5,
            componente_a_roles: 3,
            componente_b_cursos: 3,
            score: '3.40',
          },
        }
      }
      if (competencia.clave === 'desempeno_tecnico') {
        return {
          ...competencia,
          evidencia: {
            proyectos_completados: 4,
            proyectos_cancelados: 1,
            proyectos_evaluables: 5,
            proyectos_en_proceso_excluidos: 2,
          },
        }
      }
      return competencia
    }),
  }
}

describe('PerfilEmpleado — competencias con evidencia', () => {
  it('existe, con sus cinco competencias en el orden contractual', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    const seccion = await esperarTarjeta('Competencias')
    expect(
      seccion.getByRole('heading', { name: 'Competencias' }),
    ).toBeInTheDocument()

    // Orden contractual del backend. El nombre de cada competencia es su `<h3>`
    // y los datos de evidencia sus `<dt>`, así que se comprueban por separado.
    expect(seccion.getAllByRole('heading', { level: 3 }).map((nodo) => nodo.textContent)).toEqual([
      'Desempeño técnico',
      'Liderazgo',
      'Trabajo en equipo',
      'Comunicación',
      'Capacidad de aprendizaje',
    ])
    expect(seccion.getAllByRole('term').map((nodo) => nodo.textContent)).toEqual([
      'proyectos completados',
      'participaciones',
      'participaciones',
      'participaciones',
      'proyectos únicos',
    ])
  })

  it('queda entre Resultado actual y Última evaluación', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await esperarTarjeta('Competencias')
    const encabezados = screen.getAllByRole('heading').map((h) => h.textContent)

    const basica = encabezados.indexOf('Información básica')
    const resultado = encabezados.indexOf('Resultado actual')
    const competencias = encabezados.indexOf('Competencias')
    const evaluacion = encabezados.indexOf('Última evaluación')

    expect(resultado).toBeGreaterThan(basica)
    expect(competencias).toBeGreaterThan(resultado)
    expect(evaluacion).toBeGreaterThan(competencias)
  })

  it('repite nivel + etiqueta y añade la evidencia sin cálculos', async () => {
    respuestaResultado = () => Promise.resolve(resultadoActualConEvidenciaCompleta())

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    const seccion = await esperarTarjeta('Competencias')

    // Acotado al bloque: "Resultado actual" muestra la misma lectura.
    for (const lectura of [
      'Nivel 5 · Alto',
      'Nivel 4 · Consolidado',
      'Nivel 3 · En crecimiento',
      'Nivel 2 · En desarrollo',
      'Nivel 1 · Inicial',
    ]) {
      expect(seccion.getByText(lectura)).toBeInTheDocument()
    }

    // Cada dato con SU etiqueta de ETIQUETAS_EVIDENCIA, nunca concatenada.
    expect(seccion.getByText('proyectos completados')).toBeInTheDocument()
    expect(seccion.getByText('proyectos en proceso (excluidos)')).toBeInTheDocument()
    expect(seccion.getByText('roles distintos')).toBeInTheDocument()
    expect(seccion.getByText('cursos completados este año')).toBeInTheDocument()
  })

  it('respeta el orden de entradasOrdenadas por jerarquía', async () => {
    respuestaResultado = () => Promise.resolve(resultadoActualConEvidenciaCompleta())

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    const seccion = await esperarTarjeta('Competencias')

    // Desempeño: principal → secundario → excluido. El orden lo fija el módulo
    // compartido; aquí solo se observa, sin replicar su lógica.
    const desempeño = seccion.getByText('Desempeño técnico').closest('article')
    expect(
      within(desempeño).getAllByRole('term').map((nodo) => nodo.textContent),
    ).toEqual([
      'proyectos completados',
      'proyectos evaluables',
      'proyectos cancelados',
      'proyectos en proceso (excluidos)',
    ])

    const aprendizaje = seccion
      .getByText('Capacidad de aprendizaje')
      .closest('article')
    expect(
      within(aprendizaje).getAllByRole('term').map((nodo) => nodo.textContent),
    ).toEqual([
      'roles distintos',
      'proyectos únicos',
      'capacitaciones registradas',
      'cursos completados este año',
    ])
  })

  it('oculta los campos sin etiqueta en ETIQUETAS_EVIDENCIA', async () => {
    respuestaResultado = () => Promise.resolve(resultadoActualConEvidenciaCompleta())

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    const seccion = await esperarTarjeta('Competencias')

    // Llegan en el DTO pero no tienen etiqueta: no se inventan ni se pintan.
    for (const etiqueta of [
      'score',
      'componente_a_roles',
      'componente_b_cursos',
      'anio_calendario',
    ]) {
      expect(seccion.queryByText(etiqueta)).not.toBeInTheDocument()
    }
    // Tampoco `valor` (el porcentaje/score crudo de la competencia).
    expect(seccion.queryByText('3.40')).not.toBeInTheDocument()
    expect(seccion.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('no inventa mínimos de datos insuficientes', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    const seccion = await esperarTarjeta('Competencias')

    // El mínimo NO llega en el DTO para estas competencias: no se escribe.
    expect(seccion.queryByText(/se requieren/i)).not.toBeInTheDocument()
    expect(seccion.queryByText(/mínimo/i)).not.toBeInTheDocument()
  })

  it('no muestra experiencia, fortalezas, oportunidades, 9-Box, IA ni ranking', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    const seccion = await esperarTarjeta('Competencias')

    expect(seccion.queryByText(/experiencia/i)).not.toBeInTheDocument()
    expect(seccion.queryByText(/antigüedad/i)).not.toBeInTheDocument()
    expect(seccion.queryByText('2024-03-01')).not.toBeInTheDocument()
    expect(seccion.queryByText(/fortalezas/i)).not.toBeInTheDocument()
    expect(seccion.queryByText(/oportunidades/i)).not.toBeInTheDocument()
    expect(seccion.queryByText(/9-Box/i)).not.toBeInTheDocument()
    expect(seccion.queryByText(/\bIA\b/)).not.toBeInTheDocument()
    expect(seccion.queryByText(/recomendaci/i)).not.toBeInTheDocument()
    expect(seccion.queryByText(/ranking/i)).not.toBeInTheDocument()
    expect(seccion.queryByText(/score/i)).not.toBeInTheDocument()
    expect(seccion.queryByText(/de 5/i)).not.toBeInTheDocument()
  })

  it('no abre una segunda consulta: reutiliza el resultado ya cargado', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await esperarTarjeta('Competencias')

    // Competencias NO pide sus propios datos: sigue habiendo una sola llamada.
    expect(obtenerResultadoActual).toHaveBeenCalledTimes(1)
    expect(vi.mocked(obtenerResultadoActual).mock.calls[0]).toEqual(['token-rh', 1])
  })

  it('no aparece mientras Resultado actual sigue cargando', async () => {
    respuestaResultado = () => new Promise(() => {})

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await screen.findByText('Cargando resultado actual…')
    // Sin carga propia: el bloque simplemente aún no existe.
    expect(
      screen.queryByRole('heading', { name: 'Competencias' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Última evaluación')).toBeInTheDocument()
  })

  it('mantiene Resultado actual intacto: sin evidencia y con sus cinco competencias', async () => {
    respuestaResultado = () => Promise.resolve(resultadoActualConEvidenciaCompleta())

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await esperarTarjeta('Competencias')
    const resultadoActual = tarjeta('Resultado actual')

    // El resumen vigente NO se contaminó con la evidencia del bloque nuevo.
    expect(
      resultadoActual.getAllByRole('term').map((nodo) => nodo.textContent),
    ).toEqual([
      'Desempeño técnico',
      'Liderazgo',
      'Trabajo en equipo',
      'Comunicación',
      'Capacidad de aprendizaje',
    ])
    expect(resultadoActual.getByText('Nivel 5 · Alto')).toBeInTheDocument()
    expect(
      resultadoActual.queryByText('proyectos completados'),
    ).not.toBeInTheDocument()
    expect(resultadoActual.queryByText(/evidencia/i)).not.toBeInTheDocument()
  })
})

describe('PerfilEmpleado — Competencias con datos insuficientes', () => {
  it('muestra DI parcial sin convertirlo en 0 ni en error', async () => {
    respuestaResultado = () => Promise.resolve(resultadoActualDiParcial())

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    const seccion = await esperarTarjeta('Competencias')

    // Comunicación en DI: texto neutro, sin nivel y sin 0.
    expect(seccion.getAllByText('— Datos insuficientes')).toHaveLength(1)
    expect(seccion.queryByText('Nivel 0')).not.toBeInTheDocument()
    expect(seccion.queryByText(/0 ·/)).not.toBeInTheDocument()
    expect(
      seccion.queryByText('No pudimos cargar el resultado actual'),
    ).not.toBeInTheDocument()
    // Las demás competencias conservan su lectura completa.
    expect(seccion.getByText('Nivel 5 · Alto')).toBeInTheDocument()
    expect(seccion.getByText('Nivel 4 · Consolidado')).toBeInTheDocument()
    // La evidencia disponible de las demás sí se sigue mostrando.
    expect(seccion.getByText('proyectos completados')).toBeInTheDocument()
  })

  it('muestra las cinco en DI cuando ninguna tiene evidencia', async () => {
    respuestaResultado = () => Promise.resolve(resultadoActualDiTotal())

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    const seccion = await esperarTarjeta('Competencias')

    expect(seccion.getAllByText('— Datos insuficientes')).toHaveLength(5)
    // DI no se convierte en nivel ni inventa un 0 sustituto.
    expect(seccion.queryByText(/Nivel/)).not.toBeInTheDocument()
    expect(seccion.queryByText('Nivel 0')).not.toBeInTheDocument()
    expect(seccion.queryByText(/0 ·/)).not.toBeInTheDocument()
    expect(
      seccion.queryByText('No pudimos cargar el resultado actual'),
    ).not.toBeInTheDocument()
    // Con la evidencia vacía no se inventa un texto de mínimo.
    expect(seccion.queryByText(/se requieren/i)).not.toBeInTheDocument()
    expect(seccion.queryByText(/mínimo/i)).not.toBeInTheDocument()
    // Los cinco nombres siguen presentes: DI no borra la competencia.
    expect(
      seccion.getAllByRole('heading', { level: 3 }).map((nodo) => nodo.textContent),
    ).toEqual([
      'Desempeño técnico',
      'Liderazgo',
      'Trabajo en equipo',
      'Comunicación',
      'Capacidad de aprendizaje',
    ])
    // Con la evidencia vacía no hay ningún dato que pintar.
    expect(seccion.queryAllByRole('term')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Experiencia (PRD §8): información CONTEXTUAL, nunca una competencia ni una
// evaluación. Sin consulta propia: se alimenta del mismo `resultado.datos` que
// "Resultado actual" y "Competencias", así que aquí no se mockea nada nuevo.
// ---------------------------------------------------------------------------

describe('PerfilEmpleado — Experiencia', () => {
  it('existe, con antigüedad y proyectos únicos tal como llegan', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    const seccion = await esperarTarjeta('Experiencia')
    expect(seccion.getByRole('heading', { name: 'Experiencia' })).toBeInTheDocument()

    // El valor se muestra EXACTO: ni redondeado, ni recalculado en frontend.
    expect(seccion.getByText('Antigüedad')).toBeInTheDocument()
    expect(seccion.getByText('2.55 años')).toBeInTheDocument()
    expect(seccion.getByText('Proyectos únicos')).toBeInTheDocument()
    expect(seccion.getByText('3')).toBeInTheDocument()

    // No se aceptan las formas redondeadas que un cálculo produciría.
    expect(seccion.queryByText('3 años')).not.toBeInTheDocument()
    expect(seccion.queryByText('2 años')).not.toBeInTheDocument()
    expect(seccion.queryByText('2.6 años')).not.toBeInTheDocument()

    // La nota contextual aprobada (PRD §8: no altera las competencias).
    expect(
      seccion.getByText(
        'La experiencia es información contextual: no modifica las competencias.',
      ),
    ).toBeInTheDocument()
  })

  it('queda entre Competencias y Última evaluación', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await esperarTarjeta('Experiencia')
    const encabezados = screen.getAllByRole('heading').map((h) => h.textContent)

    expect(encabezados.indexOf('Resultado actual')).toBeGreaterThan(
      encabezados.indexOf('Información básica'),
    )
    expect(encabezados.indexOf('Competencias')).toBeGreaterThan(
      encabezados.indexOf('Resultado actual'),
    )
    expect(encabezados.indexOf('Experiencia')).toBeGreaterThan(
      encabezados.indexOf('Competencias'),
    )
    expect(encabezados.indexOf('Última evaluación')).toBeGreaterThan(
      encabezados.indexOf('Experiencia'),
    )
  })

  it('no repite la fecha de ingreso: ya está en Información básica', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    const seccion = await esperarTarjeta('Experiencia')

    // Acotado al bloque: arriba la fecha sí debe seguir mostrándose.
    expect(seccion.queryByText('Fecha de ingreso')).not.toBeInTheDocument()
    expect(seccion.queryByText('2024-03-01')).not.toBeInTheDocument()
    expect(screen.getByText('1 de marzo de 2024')).toBeInTheDocument()
  })

  it('muestra "—" cuando no hay antigüedad, sin convertirla en 0', async () => {
    respuestaResultado = () =>
      Promise.resolve(
        resultadoActualConExperiencia({
          fecha_ingreso: null,
          anios_antiguedad: null,
          proyectos_unicos: 3,
        }),
      )

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    const seccion = await esperarTarjeta('Experiencia')

    // Dato ausente: texto neutro, la fila NO desaparece y no es un error.
    expect(seccion.getByText('Antigüedad')).toBeInTheDocument()
    expect(seccion.getByText('—')).toBeInTheDocument()
    expect(seccion.queryByText('0 años')).not.toBeInTheDocument()
    expect(seccion.queryByText('0.00 años')).not.toBeInTheDocument()
    expect(seccion.queryByText(/insuficientes/i)).not.toBeInTheDocument()
    // El resto del bloque sigue intacto.
    expect(seccion.getByText('3')).toBeInTheDocument()
  })

  it('muestra "0.00 años" cuando la antigüedad es cero real', async () => {
    respuestaResultado = () =>
      Promise.resolve(
        resultadoActualConExperiencia({
          fecha_ingreso: '2026-09-28',
          anios_antiguedad: '0.00',
          proyectos_unicos: 3,
        }),
      )

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    const seccion = await esperarTarjeta('Experiencia')

    // Un cero del backend es un dato real, no un dato faltante.
    expect(seccion.getByText('0.00 años')).toBeInTheDocument()
    expect(seccion.queryByText('—')).not.toBeInTheDocument()
    expect(seccion.queryByText(/insuficientes/i)).not.toBeInTheDocument()
  })

  it('muestra "0" en proyectos únicos como dato real, no como DI', async () => {
    respuestaResultado = () =>
      Promise.resolve(
        resultadoActualConExperiencia({
          fecha_ingreso: '2024-03-01',
          anios_antiguedad: '2.55',
          proyectos_unicos: 0,
        }),
      )

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    const seccion = await esperarTarjeta('Experiencia')

    expect(seccion.getByText('Proyectos únicos')).toBeInTheDocument()
    expect(seccion.getByText('0')).toBeInTheDocument()
    // No es DI ni un texto interpretativo nuevo.
    expect(seccion.queryByText(/insuficientes/i)).not.toBeInTheDocument()
    expect(seccion.queryByText(/sin experiencia/i)).not.toBeInTheDocument()
  })

  it('no muestra score, nivel, porcentaje, seniority ni barras', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    const seccion = await esperarTarjeta('Experiencia')

    // Todo acotado al bloque: no son búsquedas globales de palabras genéricas.
    for (const patron of [/score/i, /nivel/i, /seniority/i, /ranking/i]) {
      expect(seccion.queryByText(patron)).not.toBeInTheDocument()
    }
    expect(seccion.queryByText(/%/)).not.toBeInTheDocument()
    // Sin barras ni indicadores de progreso (elementos semánticos).
    expect(seccion.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(seccion.queryByRole('meter')).not.toBeInTheDocument()
    expect(seccion.queryByRole('img')).not.toBeInTheDocument()
  })

  it('no abre una segunda consulta: reutiliza el resultado ya cargado', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await esperarTarjeta('Experiencia')

    // Experiencia NO pide sus propios datos: sigue habiendo una sola llamada.
    expect(obtenerResultadoActual).toHaveBeenCalledTimes(1)
    expect(vi.mocked(obtenerResultadoActual).mock.calls[0]).toEqual(['token-rh', 1])
  })

  it('no aparece como bloque propio mientras Resultado actual carga', async () => {
    respuestaResultado = () => new Promise(() => {})

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await screen.findByText('Cargando resultado actual…')
    // Sin carga propia: el bloque simplemente aún no existe.
    expect(
      screen.queryByRole('heading', { name: 'Experiencia' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Última evaluación')).toBeInTheDocument()
  })

  it('no contamina el bloque Competencias con los datos de contexto', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await esperarTarjeta('Experiencia')
    const competencias = tarjeta('Competencias')

    // La experiencia no se filtra dentro del bloque de evidencia.
    expect(competencias.queryByText('Antigüedad')).not.toBeInTheDocument()
    expect(
      competencias.queryByText(/no modifica las competencias/i),
    ).not.toBeInTheDocument()

    // "proyectos únicos" SÍ aparece ahí, pero como EVIDENCIA de "Capacidad de
    // aprendizaje" (mismo dato, distinto significado). Solo se comprueba que no
    // se añada la fila de contexto "Proyectos únicos".
    expect(competencias.getByText('proyectos únicos')).toBeInTheDocument()
  })
})