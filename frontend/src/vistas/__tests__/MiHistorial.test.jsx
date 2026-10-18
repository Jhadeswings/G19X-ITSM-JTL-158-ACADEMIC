// Sección Empleado → Mi historial (PRD §21.5; Style Guide §19, §26, §33).
// La API se mockea: sin llamadas reales al backend.
//
// Qué se verifica aquí y NO debe romperse con cambios de diseño:
// - solo lectura: ni 9-Box ni ejes, aunque vinieran en la respuesta;
// - el nivel se presenta con la etiqueta oficial del PRD §5;
// - "Datos insuficientes" es texto, nunca nivel 0;
// - la evolución muestra UNA competencia a la vez y cambia con el selector;
// - los estados de carga, vacío, error con reintento y paginación;
// - ninguna métrica derivada: ni delta, ni tendencia, ni promedio, ni score;
// - la cronología conserva los siete datos del registro (fecha, tipo, autor,
//   proyecto, registro, motivo y valores) con sus filtros de presentación
//   sobre la página cargada, sin tocar el contrato de /me/audits.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  POR_PAGINA_DEFECTO,
  listarEvaluacionesPropias,
} from '../../api/evaluaciones.js'
import { listarMisAuditorias } from '../../api/misAuditorias.js'
import { obtenerCuenta } from '../../api/cuenta.js'
import MiHistorial from '../MiHistorial.jsx'

vi.mock('../../api/evaluaciones.js', async () => {
  const original = await vi.importActual('../../api/evaluaciones.js')
  return { ...original, listarEvaluacionesPropias: vi.fn() }
})

// El apartado «Historial de mis participaciones» consulta su propio
// endpoint; se mockea igual que las evaluaciones (sin red).
vi.mock('../../api/misAuditorias.js', async () => {
  const original = await vi.importActual('../../api/misAuditorias.js')
  return { ...original, listarMisAuditorias: vi.fn() }
})

// Identidad propia (GET /me) que el apartado usa para el autor «Tú»:
// mismo tratamiento, sin red.
vi.mock('../../api/cuenta.js', async () => {
  const original = await vi.importActual('../../api/cuenta.js')
  return { ...original, obtenerCuenta: vi.fn() }
})

/** Las cinco competencias del snapshot, en el orden del contrato. */
const COMPETENCIAS = (nivelDesempeno, nivelLiderazgo) => [
  { clave: 'desempeno_tecnico', nivel: nivelDesempeno, status: 'CALCULABLE' },
  { clave: 'liderazgo', nivel: nivelLiderazgo, status: 'CALCULABLE' },
  { clave: 'trabajo_equipo', nivel: 3, status: 'CALCULABLE' },
  { clave: 'aprendizaje', nivel: null, status: 'INSUFFICIENT_DATA' },
  { clave: 'comunicacion', nivel: 5, status: 'CALCULABLE' },
]

/** Evaluación histórica fiel a `EvaluacionEmpleadoOut` (SIN nine_box). */
function evaluacion(id, periodo, liderazgo, sobre = {}) {
  return {
    id,
    empleado_id: 7,
    periodo,
    competencias: COMPETENCIAS(4, liderazgo),
    generado_en: '2026-09-20T14:32:10.123456+00:00',
    generado_por_cuenta_id: 4,
    ...sobre,
  }
}

/** Página fiel a `EvaluacionEmpleadoPageOut`. */
function pagina(items, { total = items.length, pagina = 1, porPagina = POR_PAGINA_DEFECTO } = {}) {
  return { total, pagina, por_pagina: porPagina, items }
}

/** Corrección fiel a `AuditoriaOut` (contrato de /me/audits y /rh/audits). */
function correccion(id, sobre = {}) {
  return {
    id,
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
    ...sobre,
  }
}

/** Página fiel a `AuditoriaPageOut`. */
function paginaCorrecciones(
  items,
  { total = items.length, pagina = 1, porPagina = POR_PAGINA_DEFECTO } = {},
) {
  return { total, pagina, por_pagina: porPagina, items }
}

/**
 * Identidad fiel a `GET /me` para la persona autenticada. El autor «Tú» se
 * corrobora contra esta identidad (cuenta_id primero), no con heurísticas.
 */
const IDENTIDAD = {
  cuenta_id: 77,
  email: 'empleado@empresa.dev',
  rol: 'EMPLEADO',
  empleado_id: 7,
  empleado_nombre: 'Ana López',
  puesto: null,
  area: null,
  must_change_password: false,
  activo: true,
}

const HISTORIAL = [
  evaluacion(11, '2026-Q3', 4),
  evaluacion(10, '2026-Q2', 3),
  evaluacion(9, '2026-Q1', null),
]

beforeEach(() => {
  vi.mocked(listarEvaluacionesPropias).mockReset()
  vi.mocked(listarEvaluacionesPropias).mockResolvedValue(pagina(HISTORIAL))
  // Por defecto el apartado de correcciones llega vacío: los tests de
  // evaluaciones no deben depender de él.
  vi.mocked(listarMisAuditorias).mockReset()
  vi.mocked(listarMisAuditorias).mockResolvedValue(paginaCorrecciones([]))
  // Identidad propia disponible por defecto; los tests que necesiten lo
  // contrario la reprograman explícitamente.
  vi.mocked(obtenerCuenta).mockReset()
  vi.mocked(obtenerCuenta).mockResolvedValue(IDENTIDAD)
})

/**
 * Espera a que la pantalla esté pintada. NO busca un periodo: cada periodo
 * aparece dos veces por diseño (Timeline de evolución + listado completo), así
 * que se espera el encabezado de sección, que es único. Con la espera mínima
 * de carga (400 ms), el contenido tarda un poco más en llegar: se aguarda el
 * primer periodo renderizado.
 */
async function esperarHistorial() {
  await screen.findByRole('heading', { name: 'Mi historial', level: 1 })
  await waitFor(
    () =>
      expect(
        screen.queryByText('No pudimos cargar tu historial') ||
          screen.queryByText('Todavía no tienes evaluaciones oficiales.') ||
          document.querySelector('.historial-periodo'),
      ).toBeTruthy(),
    { timeout: 3000 },
  )
}

describe('MiHistorial — carga y estados', () => {
  it('renderiza el encabezado de la sección', async () => {
    render(<MiHistorial token="token-empleado" />)

    expect(
      screen.getByRole('heading', { name: 'Mi historial', level: 1 }),
    ).toBeInTheDocument()
    await esperarHistorial()
  })

  it('consulta el historial propio con el token al abrir la sección', async () => {
    render(<MiHistorial token="token-empleado" />)

    await waitFor(() => expect(listarEvaluacionesPropias).toHaveBeenCalledTimes(1))
    const [token, opciones] = vi.mocked(listarEvaluacionesPropias).mock.calls[0]
    expect(token).toBe('token-empleado')
    expect(opciones.pagina).toBe(1)
    expect(opciones.porPagina).toBe(POR_PAGINA_DEFECTO)
  })

  it('muestra un estado de carga antes de resolver la consulta', async () => {
    render(<MiHistorial token="token-empleado" />)

    expect(screen.getByText('Cargando tu historial…')).toBeInTheDocument()
    await esperarHistorial()
  })

  it('una respuesta muy rápida mantiene el loading visible el mínimo perceptible', async () => {
    const inicio = Date.now()
    render(<MiHistorial token="token-empleado" />)

    expect(screen.getByText('Cargando tu historial…')).toBeInTheDocument()
    await esperarHistorial()
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(350)
  })

  it('un error de la consulta general no espera el mínimo', async () => {
    vi.mocked(listarEvaluacionesPropias).mockRejectedValueOnce(
      Object.assign(new Error('Fallo'), { estado: 500 }),
    )
    const inicio = Date.now()
    render(<MiHistorial token="token-empleado" />)

    expect(
      await screen.findByText('No pudimos cargar tu historial'),
    ).toBeInTheDocument()
    expect(Date.now() - inicio).toBeLessThan(400)
  })

  it('muestra el estado vacío solo cuando total es 0', async () => {
    vi.mocked(listarEvaluacionesPropias).mockResolvedValue(pagina([], { total: 0 }))

    render(<MiHistorial token="token-empleado" />)

    expect(
      await screen.findByText('Todavía no tienes evaluaciones oficiales.'),
    ).toBeInTheDocument()
  })

  it('una página vacía con total > 0 no muestra un falso estado vacío', async () => {
    vi.mocked(listarEvaluacionesPropias).mockResolvedValue(
      pagina([], { total: 25, pagina: 2, porPagina: 20 }),
    )

    render(<MiHistorial token="token-empleado" />)

    expect(
      await screen.findByRole('navigation', { name: 'Paginación de evaluaciones' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Todavía no tienes evaluaciones oficiales.'),
    ).not.toBeInTheDocument()
  })

  it('muestra error de carga y reintenta al pulsar "Intentar de nuevo"', async () => {
    vi.mocked(listarEvaluacionesPropias).mockRejectedValueOnce(
      Object.assign(new Error('Fallo'), { estado: 500 }),
    )

    render(<MiHistorial token="token-empleado" />)

    expect(await screen.findByText('No pudimos cargar tu historial')).toBeInTheDocument()

    await waitFor(() => expect(listarEvaluacionesPropias).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    await waitFor(() => expect(listarEvaluacionesPropias).toHaveBeenCalledTimes(2))
    await esperarHistorial()
  })

  it('el mensaje de error nunca muestra la excepción técnica', async () => {
    vi.mocked(listarEvaluacionesPropias).mockRejectedValue(
      Object.assign(new Error('Error: connection refused 10.0.0.5'), { estado: 500 }),
    )

    render(<MiHistorial token="token-empleado" />)

    await screen.findByText('No pudimos cargar tu historial')
    expect(screen.queryByText(/connection refused/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/10\.0\.0\.5/)).not.toBeInTheDocument()
  })

  it('el 401 delega en alSesionExpirada sin mostrar estado de error', async () => {
    const alSesionExpirada = vi.fn()
    vi.mocked(listarEvaluacionesPropias).mockRejectedValue(
      Object.assign(new Error('Sesión inválida'), { estado: 401 }),
    )

    render(<MiHistorial token="token-empleado" alSesionExpirada={alSesionExpirada} />)

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('No pudimos cargar tu historial')).not.toBeInTheDocument()
  })
})

describe('MiHistorial — evaluaciones históricas', () => {
  it('muestra cada periodo del snapshot con su fecha de generación', async () => {
    render(<MiHistorial token="token-empleado" />)
    await esperarHistorial()

    const periodos = document.querySelectorAll('.historial-periodo')
    expect(periodos).toHaveLength(3)
    // Periodos en el ORDEN del backend (periodo DESC): no se reordena.
    expect([...document.querySelectorAll('.historial-periodo__titulo')].map((n) => n.textContent))
      .toEqual(['2026-Q3', '2026-Q2', '2026-Q1'])
    expect(within(periodos[0]).getByText('Generada el 2026-09-20')).toBeInTheDocument()
  })

  it('muestra las cinco competencias de cada evaluación', async () => {
    render(<MiHistorial token="token-empleado" />)
    await esperarHistorial()

    const primerPeriodo = document.querySelector('.historial-periodo')
    expect(primerPeriodo.querySelectorAll('.historial-competencia')).toHaveLength(5)
    for (const nombre of [
      'Desempeño técnico',
      'Liderazgo',
      'Trabajo en equipo',
      'Capacidad de aprendizaje',
      'Comunicación',
    ]) {
      expect(within(primerPeriodo).getByText(nombre)).toBeInTheDocument()
    }
  })

  it('usa las etiquetas oficiales del PRD §5 para cada nivel 1–5', async () => {
    vi.mocked(listarEvaluacionesPropias).mockResolvedValue(
      pagina([
        {
          id: 1,
          empleado_id: 7,
          periodo: '2026-Q3',
          competencias: [
            { clave: 'desempeno_tecnico', nivel: 1, status: 'CALCULABLE' },
            { clave: 'liderazgo', nivel: 2, status: 'CALCULABLE' },
            { clave: 'trabajo_equipo', nivel: 3, status: 'CALCULABLE' },
            { clave: 'aprendizaje', nivel: 4, status: 'CALCULABLE' },
            { clave: 'comunicacion', nivel: 5, status: 'CALCULABLE' },
          ],
          generado_en: '2026-09-20T14:32:10.123456+00:00',
          generado_por_cuenta_id: 4,
        },
      ]),
    )

    render(<MiHistorial token="token-empleado" />)
    await esperarHistorial()

    const etiquetas = [...document.querySelectorAll('.historial-periodo .historial-competencia__nivel')].map(
      (b) => b.textContent,
    )
    expect(etiquetas).toEqual([
      'Inicial',
      'En desarrollo',
      'En crecimiento',
      'Consolidado',
      'Alto',
    ])
  })

  it('muestra "Datos insuficientes" como estado textual, nunca como nivel 0', async () => {
    render(<MiHistorial token="token-empleado" />)
    await esperarHistorial()

    const primerPeriodo = document.querySelector('.historial-periodo')
    const aprendizaje = within(primerPeriodo).getByText('Capacidad de aprendizaje').closest('div')
    expect(within(aprendizaje).getByText('Datos insuficientes')).toBeInTheDocument()
    expect(aprendizaje.textContent).not.toMatch(/\b0\b/)
  })
})

describe('MiHistorial — evolución de una competencia (PRD §21.5)', () => {
  it('ofrece un selector con las cinco competencias del snapshot', async () => {
    render(<MiHistorial token="token-empleado" />)
    await esperarHistorial()

    const selector = screen.getByRole('group', { name: 'Elegir competencia' })
    expect(within(selector).getAllByRole('button')).toHaveLength(5)
    expect(within(selector).getByRole('button', { name: 'Liderazgo' })).toBeInTheDocument()
  })

  it('muestra UNA sola competencia por defecto en la Timeline', async () => {
    render(<MiHistorial token="token-empleado" />)
    await esperarHistorial()

    const selector = screen.getByRole('group', { name: 'Elegir competencia' })
    const seleccionados = within(selector)
      .getAllByRole('button')
      .filter((boton) => boton.getAttribute('aria-pressed') === 'true')
    expect(seleccionados).toHaveLength(1)
    expect(seleccionados[0]).toHaveTextContent('Desempeño técnico')

    // La Timeline muestra los periodos con el estado de esa única competencia.
    const puntos = document.querySelectorAll('.historial-timeline__item')
    expect(puntos).toHaveLength(3)
    expect(puntos[0].textContent).toContain('2026-Q3')
  })

  it('la Timeline muestra el nivel/estado histórico real de la competencia', async () => {
    render(<MiHistorial token="token-empleado" />)
    await esperarHistorial()

    const puntos = [...document.querySelectorAll('.historial-timeline__item')]
    // Desempeño técnico es nivel 4 en las tres evaluaciones del fixture.
    expect(puntos.map((p) => p.textContent)).toEqual([
      '2026-Q34Consolidado',
      '2026-Q24Consolidado',
      '2026-Q14Consolidado',
    ])
  })

  it('cambia de competencia y muestra solo esa evolución', async () => {
    render(<MiHistorial token="token-empleado" />)
    await esperarHistorial()

    fireEvent.click(screen.getByRole('button', { name: 'Liderazgo' }))

    const puntos = [...document.querySelectorAll('.historial-timeline__item')]
    // Liderazgo: 4, 3 y sin datos (INSUFFICIENT_DATA) en los tres periodos.
    expect(puntos[0].textContent).toContain('Consolidado')
    expect(puntos[1].textContent).toContain('En crecimiento')
    expect(puntos[2].textContent).toContain('Datos insuficientes')

    const selector = screen.getByRole('group', { name: 'Elegir competencia' })
    expect(within(selector).getByRole('button', { name: 'Liderazgo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(selector).getByRole('button', { name: 'Desempeño técnico' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('mantiene los periodos en el orden que devuelve el backend', async () => {
    render(<MiHistorial token="token-empleado" />)
    await esperarHistorial()

    fireEvent.click(screen.getByRole('button', { name: 'Comunicación' }))

    const periodos = [...document.querySelectorAll('.historial-timeline__periodo')].map(
      (p) => p.textContent,
    )
    expect(periodos).toEqual(['2026-Q3', '2026-Q2', '2026-Q1'])
  })
})

describe('MiHistorial — paginación', () => {
  it('no muestra paginación cuando todo cabe en una página', async () => {
    render(<MiHistorial token="token-empleado" />)
    await esperarHistorial()

    expect(screen.queryByRole('navigation', { name: 'Paginación de evaluaciones' })).toBeNull()
  })

  it('el rango se calcula con total y por_pagina del backend', async () => {
    vi.mocked(listarEvaluacionesPropias).mockResolvedValue(
      pagina(HISTORIAL, { total: 42, pagina: 1, porPagina: 20 }),
    )

    render(<MiHistorial token="token-empleado" />)
    await esperarHistorial()

    const paginacion = screen.getByRole('navigation', { name: 'Paginación de evaluaciones' })
    expect(paginacion).toHaveTextContent('42')
  })

  it('cambia de página y vuelve a listar con la nueva página', async () => {
    vi.mocked(listarEvaluacionesPropias).mockResolvedValue(
      pagina(HISTORIAL, { total: 42, pagina: 1, porPagina: 20 }),
    )

    render(<MiHistorial token="token-empleado" />)
    await esperarHistorial()
    await waitFor(() => expect(listarEvaluacionesPropias).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByLabelText('Página 2'))

    await waitFor(() => expect(listarEvaluacionesPropias).toHaveBeenCalledTimes(2))
    const [, opciones] = vi.mocked(listarEvaluacionesPropias).mock.calls.at(-1)
    expect(opciones.pagina).toBe(2)
    expect(opciones.porPagina).toBe(POR_PAGINA_DEFECTO)
  })
})

describe('MiHistorial — lo que la vista NO muestra', () => {
  it('no presenta 9-Box ni ejes aunque la respuesta los trajera', async () => {
    // Aunque el DTO del Empleado no los trae, la vista no debe presentarlos.
    vi.mocked(listarEvaluacionesPropias).mockResolvedValue(
      pagina([
        {
          ...evaluacion(11, '2026-Q3', 4),
          nine_box: { performance_axis: 4.1, potential_axis: 4.4, box_code: 'A2' },
          performance_axis: 4.1,
          potential_axis: 4.4,
          box_code: 'A2',
        },
      ]),
    )

    const { container } = render(<MiHistorial token="token-empleado" />)
    await esperarHistorial()

    expect(container.textContent).not.toMatch(/9-?box|nine_box/i)
    expect(container.textContent).not.toMatch(/eje|axis/i)
    expect(container.textContent).not.toMatch(/\bA2\b/)
  })

  it('no inventa métricas derivadas: ni delta, tendencia, promedio ni score', async () => {
    render(<MiHistorial token="token-empleado" />)
    await esperarHistorial()

    // Términos inequívocamente derivados. NO se comprueba "crecimiento" ni
    // "variación" porque "En crecimiento" es la etiqueta OFICIAL del nivel 3
    // (PRD §5), no una métrica inventada por la vista.
    expect(document.body.textContent).not.toMatch(
      /delta|tendencia|promedio|score|puntuaci|\d+\s*%|↑|↓|media hist|acumulado|ranking/i,
    )
    // Ni flechas de subida/bajada como indicators sueltos.
    expect(document.body.textContent).not.toMatch(/[▲▼]/)
  })

  it('no usa gráficas cuantitativas: ni canvas, ni svg de datos, ni gauges', async () => {
    const { container } = render(<MiHistorial token="token-empleado" />)
    await esperarHistorial()

    expect(container.querySelector('canvas')).toBeNull()
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('meter')).toBeNull()
    expect(container.querySelector('progress')).toBeNull()
    expect(container.querySelector('[role="img"]')).toBeNull()
  })

  it('no ofrece editar, eliminar ni regenerar evaluaciones (§24)', async () => {
    render(<MiHistorial token="token-empleado" />)
    await esperarHistorial()

    // La vista es de SOLO LECTURA: ningún botón debe ser una acción de
    // escritura (editar/eliminar/regenerar/corregir/guardar). No se exige una
    // lista cerrada de botones permitidos porque ahora existen controles de
    // solo lectura legítimos (selector de competencia y paginación).
    const botones = [...document.querySelectorAll('button')].map((b) =>
      b.textContent.trim(),
    )
    const deEscritura = /editar|eliminar|borrar|regenerar|corregir|actualizar|guardar/i
    for (const boton of botones) {
      expect(boton).not.toMatch(deEscritura)
    }
    expect(screen.queryByRole('button', { name: /Editar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Eliminar|Borrar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Actualizar|Guardar/i })).toBeNull()
  })

  it('no inventa navegación ni detalle de una evaluación', async () => {
    render(<MiHistorial token="token-empleado" />)
    await esperarHistorial()

    expect(document.querySelectorAll('a[href]')).toHaveLength(0)
    expect(screen.queryByRole('link')).toBeNull()
  })
})


describe('MiHistorial — Historial de mis participaciones (apartado interno)', () => {
  /** Espera a que el apartado del historial esté resuelto (con espera mínima). */
  async function esperarCorrecciones() {
    await screen.findByRole('heading', {
      name: 'Historial de mis participaciones',
      level: 2,
    })
    await waitFor(
      () =>
        expect(
          screen.queryByText('No pudimos cargar tus correcciones') ||
            screen.queryByText(
              'Todavía no hay correcciones sobre tus participaciones.',
            ) ||
            document.querySelector('.historial-correcciones__eventos'),
        ).toBeTruthy(),
      { timeout: 3000 },
    )
  }

  it('consulta su historial con el token y la paginación del contrato', async () => {
    render(<MiHistorial token="token-empleado" />)

    await waitFor(() => expect(listarMisAuditorias).toHaveBeenCalledTimes(1))
    const [token, opciones] = vi.mocked(listarMisAuditorias).mock.calls[0]
    expect(token).toBe('token-empleado')
    expect(opciones.pagina).toBe(1)
    expect(opciones.porPagina).toBe(POR_PAGINA_DEFECTO)
  })

  it('aclara que incluye correcciones de RH y modificaciones propias', async () => {
    render(<MiHistorial token="token-empleado" />)
    await esperarCorrecciones()

    expect(
      screen.getByText(/correcciones administrativas que RH realizó/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/las modificaciones que tú mismo hiciste/i),
    ).toBeInTheDocument()
  })

  it('lista fecha, proyecto, registro, campo, valores, motivo y autor', async () => {
    vi.mocked(listarMisAuditorias).mockResolvedValue(
      paginaCorrecciones([correccion(5)]),
    )
    render(<MiHistorial token="token-empleado" />)
    await esperarCorrecciones()

    // Fecha y hora reales del evento, en la columna izquierda de la cronología.
    const evento = screen.getByText('Prueba 1').closest('.historial-correcciones__evento')
    expect(evento).toHaveTextContent('2026-10-01')
    expect(evento).toHaveTextContent('12:00')
    // Registro afectado (la referencia real que trae el backend).
    expect(screen.getByText('participacion #7')).toBeInTheDocument()
    // Campo con etiqueta legible y valores anterior → nuevo.
    const valor = screen.getByText(/Horas:/).closest('.historial-correcciones__valor')
    expect(valor).toHaveTextContent('→')
    expect(valor.querySelector('.historial-correcciones__anterior')).toHaveTextContent('100')
    expect(valor.querySelector('.historial-correcciones__nuevo')).toHaveTextContent('150')
    // Motivo y autor.
    expect(screen.getByText('Corrección de horas')).toBeInTheDocument()
    expect(screen.getByText('rh@empresa.dev')).toBeInTheDocument()
  })

  /** Chip de tipo DENTRO de la cronología (el texto se repite en los filtros). */
  function chipTipo(tipo) {
    const chips = [...screen.getAllByText(tipo)].filter(
      (elemento) => elemento.closest('.historial-correcciones__evento'),
    )
    expect(chips).toHaveLength(1)
    return chips[0]
  }

  /** Evento cronológico que contiene un texto único (p. ej. el proyecto). */
  function eventoDe(texto) {
    return screen.getByText(texto).closest('.historial-correcciones__evento')
  }

  /** Autor presentado en un evento cronológico. */
  function autorDe(evento) {
    return evento.querySelector('.historial-correcciones__autor b').textContent
  }

  /** Motivo presentado en un evento cronológico («—» cuando no corresponde). */
  function motivoDe(evento) {
    return evento.querySelector('.historial-correcciones__motivo').textContent
  }

  /** Evento de modificación propia, con el actor = persona autenticada. */
  function modificacionPropia(id, sobre = {}) {
    return correccion(id, {
      operacion: 'MODIFICACION_EMPLEADO',
      actor_cuenta_id: IDENTIDAD.cuenta_id,
      actor_email: IDENTIDAD.email,
      motivo: null,
      ...sobre,
    })
  }

  it('distingue «Corrección de RH» de «Mi modificación» por la etiqueta Tipo', async () => {
    vi.mocked(listarMisAuditorias).mockResolvedValue(
      paginaCorrecciones([
        correccion(5, { operacion: 'CORRECCION' }),
        modificacionPropia(6),
      ]),
    )
    render(<MiHistorial token="token-empleado" />)
    await esperarCorrecciones()

    // El texto del tipo se repite en los filtros: se acota a la cronología.
    expect(chipTipo('Corrección de RH')).toHaveAttribute('data-dato', 'tipo')
    expect(chipTipo('Mi modificación')).toHaveAttribute('data-dato', 'tipo')
    // Punto de color: verde azulado lo propio, terracota las correcciones RH.
    expect(chipTipo('Mi modificación').className).not.toContain('--rh')
    expect(chipTipo('Corrección de RH').className).toContain('--rh')
  })

  it('una modificación propia muestra «Tú» como autor, en su columna', async () => {
    vi.mocked(listarMisAuditorias).mockResolvedValue(
      paginaCorrecciones([modificacionPropia(6)]),
    )
    render(<MiHistorial token="token-empleado" />)

    // «Tú» aparece cuando la identidad propia (GET /me) corroboró al actor.
    const tu = await screen.findByText('Tú')
    expect(tu.closest('.historial-correcciones__autor')).not.toBeNull()
    // El evento completo: el autor «Tú» NO es el correo del actor.
    expect(
      autorDe(chipTipo('Mi modificación').closest('.historial-correcciones__evento')),
    ).toBe('Tú')
  })

  it('una corrección de RH mantiene al responsable como autor', async () => {
    vi.mocked(listarMisAuditorias).mockResolvedValue(
      paginaCorrecciones([correccion(5)]),
    )
    render(<MiHistorial token="token-empleado" />)
    await esperarCorrecciones()

    expect(
      autorDe(chipTipo('Corrección de RH').closest('.historial-correcciones__evento')),
    ).toBe('rh@empresa.dev')
  })

  it('el motivo de una modificación propia es siempre «—»', async () => {
    vi.mocked(listarMisAuditorias).mockResolvedValue(
      paginaCorrecciones([
        // Aunque el registro trajera un motivo, esa operación no lo define:
        // la regla es por tipo de operación, no por el valor que llegue.
        modificacionPropia(6, { motivo: 'Sobrante que no debe mostrarse' }),
      ]),
    )
    render(<MiHistorial token="token-empleado" />)
    await esperarCorrecciones()

    expect(
      motivoDe(chipTipo('Mi modificación').closest('.historial-correcciones__evento')),
    ).toBe('—')
    expect(screen.queryByText(/Sobrante/)).toBeNull()
  })

  it('el motivo de RH se conserva y el ausente se muestra como «—»', async () => {
    vi.mocked(listarMisAuditorias).mockResolvedValue(
      paginaCorrecciones([
        correccion(5, { motivo: 'Corrección de horas' }),
        correccion(7, { motivo: null, proyecto_nombre: 'Prueba 2' }),
      ]),
    )
    render(<MiHistorial token="token-empleado" />)
    await esperarCorrecciones()

    expect(motivoDe(eventoDe('Prueba 1'))).toBe('Corrección de horas')
    expect(motivoDe(eventoDe('Prueba 2'))).toBe('—')
  })

  it('sin actor_email el autor es «No disponible», sin inventar identidad', async () => {
    vi.mocked(listarMisAuditorias).mockResolvedValue(
      paginaCorrecciones([correccion(5, { actor_email: null })]),
    )
    render(<MiHistorial token="token-empleado" />)
    await esperarCorrecciones()

    expect(
      autorDe(chipTipo('Corrección de RH').closest('.historial-correcciones__evento')),
    ).toBe('No disponible')
    expect(screen.queryByText(/Cuenta #/)).toBeNull()
  })

  it('sin identidad corroborada no se afirma «Tú»: se muestra el actor real', async () => {
    vi.mocked(obtenerCuenta).mockRejectedValue(
      Object.assign(new Error('identity down'), { estado: 500 }),
    )
    vi.mocked(listarMisAuditorias).mockResolvedValue(
      paginaCorrecciones([modificacionPropia(6)]),
    )
    render(<MiHistorial token="token-empleado" />)
    await esperarCorrecciones()

    expect(
      autorDe(chipTipo('Mi modificación').closest('.historial-correcciones__evento')),
    ).toBe('empleado@empresa.dev')
    expect(screen.queryByText('Tú')).toBeNull()
  })

  it('presenta los siete datos del registro en cada evento, en su orden', async () => {
    vi.mocked(listarMisAuditorias).mockResolvedValue(
      paginaCorrecciones([correccion(5)]),
    )
    render(<MiHistorial token="token-empleado" />)
    await esperarCorrecciones()

    // Los siete datos de la antigua tabla (fecha, tipo, autor, proyecto,
    // registro, motivo y valores) siguen presentes en la cronología, en su
    // orden de lectura: nada del registro se pierde en el rediseño.
    const evento = chipTipo('Corrección de RH').closest('.historial-correcciones__evento')
    const datos = [...evento.querySelectorAll('[data-dato]')].map(
      (nodo) => nodo.dataset.dato,
    )
    expect(datos).toEqual([
      'fecha', 'tipo', 'autor', 'proyecto', 'registro', 'motivo', 'valores',
    ])
  })

  it('muestra el estado vacío cuando no hay correcciones', async () => {
    vi.mocked(listarMisAuditorias).mockResolvedValue(
      paginaCorrecciones([], { total: 0 }),
    )
    render(<MiHistorial token="token-empleado" />)

    expect(
      await screen.findByText(
        'Todavía no hay correcciones sobre tus participaciones.',
      ),
    ).toBeInTheDocument()
    // El aviso vacío explica AMBOS tipos de evento, no solo RH (§25).
    expect(
      screen.getByText(/Cuando RH corrija una participación tuya/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/cuando tú mismo modifiques una/i),
    ).toBeInTheDocument()
  })

  it('una página vacía con total > 0 no muestra un falso estado vacío', async () => {
    vi.mocked(listarMisAuditorias).mockResolvedValue(
      paginaCorrecciones([], { total: 25, pagina: 2, porPagina: 20 }),
    )
    render(<MiHistorial token="token-empleado" />)

    expect(
      await screen.findByRole('navigation', { name: 'Paginación de correcciones' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Todavía no hay correcciones sobre tus participaciones.'),
    ).not.toBeInTheDocument()
  })

  it('muestra error de carga con reintento, sin excepción técnica', async () => {
    vi.mocked(listarMisAuditorias).mockRejectedValue(
      Object.assign(new Error('connection refused 10.0.0.5'), { estado: 500 }),
    )
    render(<MiHistorial token="token-empleado" />)

    expect(
      await screen.findByText('No pudimos cargar tus correcciones'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/connection refused/i)).not.toBeInTheDocument()
  })

  it('el 401 del apartado delega en alSesionExpirada', async () => {
    const alSesionExpirada = vi.fn()
    vi.mocked(listarMisAuditorias).mockRejectedValue(
      Object.assign(new Error('Sesión inválida'), { estado: 401 }),
    )
    render(
      <MiHistorial token="token-empleado" alSesionExpirada={alSesionExpirada} />,
    )

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(
      screen.queryByText('No pudimos cargar tus correcciones'),
    ).not.toBeInTheDocument()
  })

  it('la paginación de correcciones vuelve a consultar la página pedida', async () => {
    vi.mocked(listarMisAuditorias).mockResolvedValue(
      paginaCorrecciones([correccion(5)], { total: 40, pagina: 1, porPagina: 20 }),
    )
    render(<MiHistorial token="token-empleado" />)
    await esperarCorrecciones()

    await waitFor(() => expect(listarMisAuditorias).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByLabelText('Página 2'))

    await waitFor(() => expect(listarMisAuditorias).toHaveBeenCalledTimes(2))
    const [, opciones] = vi.mocked(listarMisAuditorias).mock.calls.at(-1)
    expect(opciones.pagina).toBe(2)
  })

  it('ofrece tres filtros de tipo y por defecto lista todos los eventos cargados', async () => {
    vi.mocked(listarMisAuditorias).mockResolvedValue(
      paginaCorrecciones([correccion(5), modificacionPropia(6)]),
    )
    render(<MiHistorial token="token-empleado" />)
    await esperarCorrecciones()

    const filtros = screen.getByRole('group', { name: 'Filtrar por tipo de cambio' })
    expect(within(filtros).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Todos',
      'Mi modificación',
      'Corrección de RH',
    ])
    expect(within(filtros).getByRole('button', { name: 'Todos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(document.querySelectorAll('.historial-correcciones__evento')).toHaveLength(2)
    // Sin aviso de filtro: solo aparece cuando hay un filtro específico activo.
    expect(screen.queryByText(/Mostrando solo los registros de esta página/)).toBeNull()
  })

  it('«Corrección de RH» filtra la página cargada sin tocar total ni consultas', async () => {
    vi.mocked(listarMisAuditorias).mockResolvedValue(
      paginaCorrecciones(
        [correccion(5), modificacionPropia(6), correccion(7, { proyecto_nombre: 'Prueba 2' })],
        { total: 40, pagina: 1, porPagina: 20 },
      ),
    )
    render(<MiHistorial token="token-empleado" />)
    await esperarCorrecciones()

    const filtros = screen.getByRole('group', { name: 'Filtrar por tipo de cambio' })
    fireEvent.click(within(filtros).getByRole('button', { name: 'Corrección de RH' }))

    // Solo correcciones de RH visibles; la modificación propia desaparece.
    const eventos = [...document.querySelectorAll('.historial-correcciones__evento')]
    expect(eventos).toHaveLength(2)
    for (const evento of eventos) {
      expect(evento).toHaveTextContent('Corrección de RH')
      expect(evento).not.toHaveTextContent('Mi modificación')
    }
    // Aviso discreto: el filtro es sobre la página cargada, no el historial total.
    expect(
      screen.getByText(/Mostrando solo los registros de esta página/),
    ).toBeInTheDocument()
    // El total y la paginación del backend no cambian, y NO se vuelve a consultar.
    expect(listarMisAuditorias).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('navigation', { name: 'Paginación de correcciones' }),
    ).toHaveTextContent('40')
  })

  it('«Mi modificación» muestra solo lo propio y «Todos» restaura la página', async () => {
    vi.mocked(listarMisAuditorias).mockResolvedValue(
      paginaCorrecciones([correccion(5), modificacionPropia(6)]),
    )
    render(<MiHistorial token="token-empleado" />)
    await esperarCorrecciones()

    const filtros = screen.getByRole('group', { name: 'Filtrar por tipo de cambio' })
    fireEvent.click(within(filtros).getByRole('button', { name: 'Mi modificación' }))

    const propios = [...document.querySelectorAll('.historial-correcciones__evento')]
    expect(propios).toHaveLength(1)
    expect(propios[0]).toHaveTextContent('Tú')
    expect(within(filtros).getByRole('button', { name: 'Mi modificación' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(listarMisAuditorias).toHaveBeenCalledTimes(1)

    fireEvent.click(within(filtros).getByRole('button', { name: 'Todos' }))

    expect(document.querySelectorAll('.historial-correcciones__evento')).toHaveLength(2)
    expect(within(filtros).getByRole('button', { name: 'Todos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.queryByText(/Mostrando solo los registros de esta página/)).toBeNull()
  })

  it('un filtro sin coincidencias no muestra el estado vacío global', async () => {
    vi.mocked(listarMisAuditorias).mockResolvedValue(
      paginaCorrecciones([correccion(5)]),
    )
    render(<MiHistorial token="token-empleado" />)
    await esperarCorrecciones()

    const filtros = screen.getByRole('group', { name: 'Filtrar por tipo de cambio' })
    fireEvent.click(within(filtros).getByRole('button', { name: 'Mi modificación' }))

    expect(
      screen.getByText('Ningún registro de esta página coincide con el filtro seleccionado.'),
    ).toBeInTheDocument()
    // El estado vacío global solo corresponde a total === 0.
    expect(
      screen.queryByText('Todavía no hay correcciones sobre tus participaciones.'),
    ).not.toBeInTheDocument()
    expect(listarMisAuditorias).toHaveBeenCalledTimes(1)
  })

  it('traduce claves técnicas a etiquetas legibles y conserva las desconocidas', async () => {
    vi.mocked(listarMisAuditorias).mockResolvedValue(
      paginaCorrecciones([
        correccion(5, {
          valores_anteriores: { horas: 100, en_equipo: true, clave_interna: 'a' },
          valores_nuevos: { horas: 10, en_equipo: false, clave_interna: 'b' },
        }),
      ]),
    )
    render(<MiHistorial token="token-empleado" />)
    await esperarCorrecciones()

    // Etiquetas legibles para claves REALES de participación…
    expect(screen.getByText('Horas:')).toBeInTheDocument()
    expect(screen.getByText('Trabajo en equipo:')).toBeInTheDocument()
    // …y clave desconocida visible tal cual, sin perder información.
    expect(screen.getByText('clave_interna:')).toBeInTheDocument()
    // Los valores siguen siendo los del backend (booleanos → Sí/No).
    const equipo = screen
      .getByText('Trabajo en equipo:')
      .closest('.historial-correcciones__valor')
    expect(equipo.querySelector('.historial-correcciones__anterior')).toHaveTextContent('Sí')
    expect(equipo.querySelector('.historial-correcciones__nuevo')).toHaveTextContent('No')
  })

  it('no ofrece editar, eliminar ni regenerar correcciones', async () => {
    vi.mocked(listarMisAuditorias).mockResolvedValue(
      paginaCorrecciones([correccion(5)]),
    )
    render(<MiHistorial token="token-empleado" />)
    await esperarCorrecciones()

    expect(screen.queryByRole('button', { name: /Editar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Eliminar|Borrar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Actualizar|Guardar/i })).toBeNull()
  })
})

