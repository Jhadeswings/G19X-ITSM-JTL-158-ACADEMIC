// Sección Empleado → Mi historial (PRD §21.5; Style Guide §19, §26, §33).
// La API se mockea: sin llamadas reales al backend.
//
// Qué se verifica aquí y NO debe romperse con cambios de diseño:
// - solo lectura: ni 9-Box ni ejes, aunque vinieran en la respuesta;
// - el nivel se presenta con la etiqueta oficial del PRD §5;
// - "Datos insuficientes" es texto, nunca nivel 0;
// - la evolución muestra UNA competencia a la vez y cambia con el selector;
// - los estados de carga, vacío, error con reintento y paginación;
// - ninguna métrica derivada: ni delta, ni tendencia, ni promedio, ni score.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  POR_PAGINA_DEFECTO,
  listarEvaluacionesPropias,
} from '../../api/evaluaciones.js'
import { listarMisAuditorias } from '../../api/misAuditorias.js'
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
})

/**
 * Espera a que la pantalla esté pintada. NO busca un periodo: cada periodo
 * aparece dos veces por diseño (Timeline de evolución + listado completo), así
 * que se espera el encabezado de sección, que es único.
 */
async function esperarHistorial() {
  await screen.findByRole('heading', { name: 'Mi historial', level: 1 })
  await waitFor(() =>
    expect(
      screen.queryByText('Cargando tu historial…') ||
        screen.queryByText('No pudimos cargar tu historial') ||
        screen.queryByText('Todavía no tienes evaluaciones oficiales.') ||
        document.querySelector('.historial-periodo'),
    ).toBeTruthy(),
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

    const etiquetas = [...document.querySelectorAll('.historial-periodo .ui-badge')].map(
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
  /** Espera a que el apartado del historial esté resuelto. */
  async function esperarCorrecciones() {
    await screen.findByRole('heading', {
      name: 'Historial de mis participaciones',
      level: 2,
    })
    await waitFor(() =>
      expect(
        screen.queryByText('Cargando tus correcciones…') ||
          screen.queryByText('No pudimos cargar tus correcciones') ||
          screen.queryByText(
            'Todavía no hay correcciones sobre tus participaciones.',
          ) ||
          document.querySelector('.historial-correcciones table'),
      ).toBeTruthy(),
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

    // Proyecto y registro afectado.
    expect(screen.getByText('Prueba 1')).toBeInTheDocument()
    expect(screen.getByText('participacion #7')).toBeInTheDocument()
    // Campo modificado con valores anterior → nuevo.
    expect(screen.getAllByText('horas:').length).toBeGreaterThan(0)
    expect(screen.getByText(/100.*→.*150/)).toBeInTheDocument()
    // Motivo y autor.
    expect(screen.getByText('Corrección de horas')).toBeInTheDocument()
    expect(screen.getByText('rh@empresa.dev')).toBeInTheDocument()
  })

  it('distingue «Corrección de RH» de «Mi modificación» por la etiqueta Tipo', async () => {
    vi.mocked(listarMisAuditorias).mockResolvedValue(
      paginaCorrecciones([
        correccion(5, { operacion: 'CORRECCION' }),
        correccion(6, { operacion: 'MODIFICACION_EMPLEADO', motivo: null }),
      ]),
    )
    render(<MiHistorial token="token-empleado" />)
    await esperarCorrecciones()

    expect(screen.getByText('Corrección de RH')).toBeInTheDocument()
    expect(screen.getByText('Mi modificación')).toBeInTheDocument()
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

