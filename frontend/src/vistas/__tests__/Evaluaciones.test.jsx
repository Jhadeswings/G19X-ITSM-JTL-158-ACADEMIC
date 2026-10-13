// Sección RH → Evaluaciones (PRD §20.8; ET §22–§24, §31; Style Guide §13).
// La API se mockea: sin llamadas reales al backend.
//
// Qué se verifica aquí y NO debe romperse con cambios de diseño:
// - render inicial, carga, vacío, error con reintento y datos válidos;
// - confirmación previa EN LÍNEA (SG §26): primer clic sin API, cancelar
//   sin generar, confirmar UNA sola vez y texto histórico/inmutable;
// - generación del periodo vigente (éxito, cero generadas y 409);
// - historial paginado con filtro de periodo del contrato;
// - 401 → alSesionExpirada en lectura y en generación;
// - snapshot histórico INMUTABLE: ni editar, ni eliminar, ni regenerar;
// - ninguna métrica derivada en React: ni competencias, ni 9-Box, ni
//   promedios, ni deltas, ni rankings, ni gráficas; "Datos insuficientes"
//   se conserva como estado válido;
// - RH-01.1: identificación (nombre, puesto · área) salida EXCLUSIVAMENTE
//   del snapshot —jamás del empleado actual ni del ID técnico— y explicación
//   de "9-Box: Datos insuficientes" con las reglas oficiales del backend.

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  POR_PAGINA_DEFECTO,
  generarEvaluaciones,
  listarEvaluaciones,
} from '../../api/evaluaciones.js'
import { listarEmpleados } from '../../api/empleados.js'
import Evaluaciones from '../Evaluaciones.jsx'

vi.mock('../../api/evaluaciones.js', async () => {
  const original = await vi.importActual('../../api/evaluaciones.js')
  return {
    ...original,
    listarEvaluaciones: vi.fn(),
    generarEvaluaciones: vi.fn(),
  }
})

// RH-01.1: la identificación NUNCA se resuelve con una consulta al empleado
// actual; si esta API se llegara a llamar, el test de identificación falla.
vi.mock('../../api/empleados.js', () => ({ listarEmpleados: vi.fn() }))

/** Las cinco competencias del snapshot, en el orden del contrato. */
const COMPETENCIAS = (nivelDesempeno, nivelLiderazgo) => [
  { clave: 'desempeno_tecnico', nivel: nivelDesempeno, status: 'CALCULABLE' },
  { clave: 'liderazgo', nivel: nivelLiderazgo, status: 'CALCULABLE' },
  { clave: 'trabajo_equipo', nivel: 3, status: 'CALCULABLE' },
  { clave: 'aprendizaje', nivel: null, status: 'INSUFFICIENT_DATA' },
  { clave: 'comunicacion', nivel: 5, status: 'CALCULABLE' },
]

/**
 * Identificación histórica por empleado (RH-01.1): igual que en el contrato,
 * capturada al generar. Incluye los tres casos de completitud: todo
 * disponible, solo puesto, y solo área.
 */
const IDENTIFICACION = {
  7: {
    empleado_nombre: 'Ana Ruiz',
    empleado_puesto: 'Desarrolladora de software',
    empleado_area: 'Tecnología',
  },
  8: { empleado_nombre: 'Bo Marín', empleado_puesto: 'Tech Lead', empleado_area: null },
  9: { empleado_nombre: 'Clara Sanz', empleado_puesto: null, empleado_area: 'Datos' },
}

/** Evaluación histórica fiel a `EvaluacionOut` (CON nine_box, §10). */
function evaluacion(id, periodo, empleadoId, liderazgo, sobre = {}) {
  return {
    id,
    empleado_id: empleadoId,
    ...IDENTIFICACION[empleadoId],
    periodo,
    competencias: COMPETENCIAS(4, liderazgo),
    generado_en: '2026-09-20T14:32:10.123456+00:00',
    generado_por_cuenta_id: 4,
    nine_box: {
      performance_axis: '4.100',
      potential_axis: '4.400',
      box_code: 'AA',
      etiqueta_performance: 'Alto',
      etiqueta_potencial: 'Alto',
    },
    ...sobre,
  }
}

/** Página fiel a `EvaluacionPageOut`. */
function pagina(items, { total = items.length, pagina = 1, porPagina = POR_PAGINA_DEFECTO } = {}) {
  return { total, pagina, por_pagina: porPagina, items }
}

const HISTORIAL = [
  evaluacion(11, '2026-Q3', 7, 4),
  evaluacion(10, '2026-Q2', 8, null),
  evaluacion(9, '2026-Q1', 9, 3),
]

beforeEach(() => {
  vi.mocked(listarEvaluaciones).mockReset()
  vi.mocked(generarEvaluaciones).mockReset()
  vi.mocked(listarEvaluaciones).mockResolvedValue(pagina(HISTORIAL))
})

/** Espera a que la pantalla deje de estar en carga o error. */
async function esperarListado() {
  await screen.findByRole('heading', { name: 'Evaluaciones', level: 1 })
  await waitFor(() =>
    expect(
      screen.queryByText('Cargando evaluaciones…') ||
        screen.queryByText('No pudimos cargar las evaluaciones') ||
        screen.queryByText('Todavía no hay evaluaciones oficiales.') ||
        document.querySelector('.evaluaciones-item'),
    ).toBeTruthy(),
  )
}

/**
 * Recorre el flujo obligatorio de generación (SG §26): el primer clic solo
 * abre la confirmación en línea y la petición SOLO empieza con «Confirmar
 * generación».
 */
function abrirYConfirmar() {
  fireEvent.click(
    screen.getByRole('button', { name: 'Generar evaluaciones del periodo vigente' }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar generación' }))
}


describe('Evaluaciones — render inicial, carga y estados', () => {
  it('renderiza el encabezado de la sección', async () => {
    render(<Evaluaciones token="token-rh" />)

    expect(
      screen.getByRole('heading', { name: 'Evaluaciones', level: 1 }),
    ).toBeInTheDocument()
    await esperarListado()
  })

  it('consulta el historial con el token al abrir la sección', async () => {
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    expect(listarEvaluaciones).toHaveBeenCalledTimes(1)
    const [token, filtros] = vi.mocked(listarEvaluaciones).mock.calls[0]
    expect(token).toBe('token-rh')
    expect(filtros.pagina).toBe(1)
    expect(filtros.porPagina).toBe(POR_PAGINA_DEFECTO)
    expect(filtros.periodo).toBeNull()
  })

  it('muestra el estado de carga mientras responde el backend', async () => {
    vi.mocked(listarEvaluaciones).mockReturnValue(new Promise(() => {}))
    render(<Evaluaciones token="token-rh" />)

    expect(screen.getByText('Cargando evaluaciones…')).toBeInTheDocument()
  })

  it('muestra el estado vacío cuando no hay evaluaciones oficiales', async () => {
    vi.mocked(listarEvaluaciones).mockResolvedValue(pagina([]))
    render(<Evaluaciones token="token-rh" />)

    expect(
      await screen.findByText('Todavía no hay evaluaciones oficiales.'),
    ).toBeInTheDocument()
  })

  it('muestra error con reintento y vuelve a consultar', async () => {
    vi.mocked(listarEvaluaciones).mockRejectedValueOnce(
      Object.assign(new Error('fallo del servidor'), { estado: 500 }),
    )
    render(<Evaluaciones token="token-rh" />)

    expect(
      await screen.findByText('No pudimos cargar las evaluaciones'),
    ).toBeInTheDocument()
    expect(listarEvaluaciones).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    await waitFor(() => expect(listarEvaluaciones).toHaveBeenCalledTimes(2))
  })
})

describe('Evaluaciones — datos válidos del snapshot', () => {
  it('presenta periodo, empleado, competencias y 9-Box oficiales', async () => {
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    expect(screen.getAllByText('2026-Q3').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Ana Ruiz').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Generada el 2026-09-20').length).toBeGreaterThan(0)

    // Etiqueta oficial del nivel (PRD §5) sobre el nivel del DTO.
    expect(screen.getAllByText('Consolidado').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Alto').length).toBeGreaterThan(0)
    // Datos insuficientes se conserva: DI jamás es nivel 0 (§5, §14).
    expect(screen.getAllByText('Datos insuficientes').length).toBeGreaterThan(0)

    // El 9-Box del snapshot se presenta con sus valores oficiales.
    expect(
      screen.getAllByText(
        '9-Box — Rendimiento 4.100 · Alto / Potencial 4.400 · Alto / Celda AA',
      ).length,
    ).toBeGreaterThan(0)
  })

  it('conserva Datos insuficientes cuando el snapshot 9-Box llegó nulo (§20.2)', async () => {
    vi.mocked(listarEvaluaciones).mockResolvedValue(
      pagina([
        evaluacion(20, '2026-Q4', 9, 4, {
          nine_box: {
            performance_axis: null,
            potential_axis: null,
            box_code: null,
            etiqueta_performance: null,
            etiqueta_potencial: null,
          },
        }),
      ]),
    )
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    // RH-01.1: el DI del 9-Box se conserva Y se explica con las reglas
    // oficiales del backend (nine_box.py §20.1/§20.2), sin calcular nada.
    expect(screen.getByText('9-Box: Datos insuficientes.')).toBeInTheDocument()
    expect(
      screen.getByText(
        'No es posible ubicar al empleado en el 9-Box porque todavía no hay datos suficientes para calcular los ejes requeridos. El eje de rendimiento requiere información de Desempeño técnico y el eje de potencial requiere información suficiente de Liderazgo, Trabajo en equipo, Comunicación y Capacidad de aprendizaje.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'No se asigna una posición 9-Box hasta contar con información suficiente.',
      ),
    ).toBeInTheDocument()
  })

  it('la paginación usa total y por_pagina del backend', async () => {
    vi.mocked(listarEvaluaciones).mockResolvedValue(
      pagina(HISTORIAL, { total: 42, porPagina: 20 }),
    )
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    expect(
      await screen.findByRole('navigation', { name: 'Paginación de evaluaciones' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Página 2' }))

    await waitFor(() => expect(listarEvaluaciones).toHaveBeenCalledTimes(2))
    const [, filtros] = vi.mocked(listarEvaluaciones).mock.calls.at(-1)
    expect(filtros.pagina).toBe(2)
    expect(filtros.porPagina).toBe(20)
  })
})


describe('Evaluaciones — generación del periodo vigente', () => {
  it('genera con el token y presenta el periodo del DTO oficial', async () => {
    vi.mocked(generarEvaluaciones).mockResolvedValue({
      periodo: '2026-Q3',
      total_generadas: 12,
      items: [],
    })
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    abrirYConfirmar()

    expect(await screen.findByText('Evaluaciones generadas')).toBeInTheDocument()
    expect(generarEvaluaciones).toHaveBeenCalledTimes(1)
    expect(generarEvaluaciones).toHaveBeenCalledWith('token-rh')
    expect(screen.getByText('12')).toBeInTheDocument()
    // El periodo aparece en el resultado de la generación y en el historial.
    expect(screen.getAllByText('2026-Q3').length).toBeGreaterThan(0)
    // Tras el éxito se recarga el historial para reflejar la fotografía.
    await waitFor(() => expect(listarEvaluaciones).toHaveBeenCalledTimes(2))
  })

  it('sin empleados activos informa cero generadas sin inventar nada', async () => {
    vi.mocked(generarEvaluaciones).mockResolvedValue({
      periodo: '2026-Q3',
      total_generadas: 0,
      items: [],
    })
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    abrirYConfirmar()

    expect(
      await screen.findByText(/no tiene empleados activos/i),
    ).toBeInTheDocument()
  })

  it('un 409 (periodo ya generado) se informa sin cerrar nada', async () => {
    vi.mocked(generarEvaluaciones).mockRejectedValue(
      Object.assign(
        new Error('El periodo 2026-Q3 ya cuenta con evaluaciones generadas.'),
        { estado: 409 },
      ),
    )
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    abrirYConfirmar()

    expect(await screen.findByText('El periodo ya fue generado')).toBeInTheDocument()
    expect(
      screen.getByText('El periodo 2026-Q3 ya cuenta con evaluaciones generadas.'),
    ).toBeInTheDocument()
    // El conflicto NO se trata como sesión expirada.
    expect(screen.queryByRole('heading', { name: 'Inicia sesión' })).toBeNull()
  })

  it('un fallo inesperado de generación muestra estado de error legible', async () => {
    vi.mocked(generarEvaluaciones).mockRejectedValue(
      Object.assign(new Error('boom'), { estado: 500 }),
    )
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    abrirYConfirmar()

    expect(
      await screen.findByText('No pudimos generar las evaluaciones'),
    ).toBeInTheDocument()
  })
})

describe('Evaluaciones — confirmación previa a la generación (SG §26)', () => {
  it('el primer clic solo muestra la confirmación y NO llama a la API', async () => {
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    fireEvent.click(
      screen.getByRole('button', { name: 'Generar evaluaciones del periodo vigente' }),
    )

    expect(
      screen.getByText('¿Generar las evaluaciones del periodo vigente?'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar generación' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    // Sin confirmar NO existe ninguna petición de generación.
    expect(generarEvaluaciones).not.toHaveBeenCalled()
  })

  it('la confirmación explica que la fotografía será histórica e inmutable', async () => {
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    fireEvent.click(
      screen.getByRole('button', { name: 'Generar evaluaciones del periodo vigente' }),
    )

    expect(
      screen.getByText(/fotografía histórica e inmutable/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/no podrá editarse ni eliminarse/),
    ).toBeInTheDocument()
    expect(generarEvaluaciones).not.toHaveBeenCalled()
  })

  it('cancelar cierra la confirmación sin generar nada', async () => {
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    fireEvent.click(
      screen.getByRole('button', { name: 'Generar evaluaciones del periodo vigente' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(
      screen.queryByText('¿Generar las evaluaciones del periodo vigente?'),
    ).toBeNull()
    expect(screen.queryByRole('button', { name: 'Confirmar generación' })).toBeNull()
    expect(generarEvaluaciones).not.toHaveBeenCalled()
    // La acción principal vuelve a estar disponible, sin haber generado.
    expect(
      screen.getByRole('button', { name: 'Generar evaluaciones del periodo vigente' }),
    ).toBeInTheDocument()
  })

  it('confirmar llama a la API UNA sola vez con el token', async () => {
    vi.mocked(generarEvaluaciones).mockResolvedValue({
      periodo: '2026-Q3',
      total_generadas: 12,
      items: [],
    })
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    abrirYConfirmar()

    expect(await screen.findByText('Evaluaciones generadas')).toBeInTheDocument()
    expect(generarEvaluaciones).toHaveBeenCalledTimes(1)
    expect(generarEvaluaciones).toHaveBeenCalledWith('token-rh')
  })

  it('durante la generación no se disparan peticiones duplicadas', async () => {
    let finalizar = () => {}
    vi.mocked(generarEvaluaciones).mockReturnValue(
      new Promise((resolver) => {
        finalizar = () =>
          resolver({ periodo: '2026-Q3', total_generadas: 1, items: [] })
      }),
    )
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    abrirYConfirmar()

    // Estado de carga: el botón queda ocupado y la confirmación desaparece.
    const enCurso = screen.getByRole('button', { name: 'Generando evaluaciones…' })
    expect(enCurso).toBeDisabled()
    expect(enCurso).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('button', { name: 'Confirmar generación' })).toBeNull()

    fireEvent.click(enCurso)
    expect(generarEvaluaciones).toHaveBeenCalledTimes(1)

    await act(async () => {
      finalizar()
    })
    expect(await screen.findByText('Evaluaciones generadas')).toBeInTheDocument()
    expect(generarEvaluaciones).toHaveBeenCalledTimes(1)
  })
})

describe('Evaluaciones — filtro de periodo del contrato', () => {
  it('consulta con el periodo cuando respeta el patrón YYYY-QN', async () => {
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    fireEvent.change(screen.getByLabelText('Periodo'), {
      target: { value: '2026-Q2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }))

    await waitFor(() => expect(listarEvaluaciones).toHaveBeenCalledTimes(2))
    const [, filtros] = vi.mocked(listarEvaluaciones).mock.calls.at(-1)
    expect(filtros.periodo).toBe('2026-Q2')
    expect(filtros.pagina).toBe(1)
    expect(
      screen.getByText('Filtrando por periodo:'),
    ).toBeInTheDocument()
  })

  it('rechaza un periodo fuera de patrón SIN hacer la petición', async () => {
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    fireEvent.change(screen.getByLabelText('Periodo'), {
      target: { value: '2026-5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Usa el formato del sistema, por ejemplo 2026-Q1.',
    )
    expect(listarEvaluaciones).toHaveBeenCalledTimes(1)
  })

  it('limpiar el filtro vuelve a la consulta completa', async () => {
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    fireEvent.change(screen.getByLabelText('Periodo'), {
      target: { value: '2026-Q2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }))
    await waitFor(() => expect(listarEvaluaciones).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtro' }))

    await waitFor(() => expect(listarEvaluaciones).toHaveBeenCalledTimes(3))
    const [, filtros] = vi.mocked(listarEvaluaciones).mock.calls.at(-1)
    expect(filtros.periodo).toBeNull()
    expect(screen.queryByText('Filtrando por periodo:')).not.toBeInTheDocument()
  })
})

describe('Evaluaciones — identificación histórica del empleado (RH-01.1)', () => {
  it('muestra el nombre y el puesto · área capturados en el snapshot', async () => {
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    expect(screen.getAllByText('Ana Ruiz').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText('Desarrolladora de software · Tecnología').length,
    ).toBeGreaterThan(0)
  })

  it('no usa el ID técnico como identificación principal', async () => {
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    expect(screen.queryByText(/^Empleado \d+$/)).toBeNull()
  })

  it('muestra solo el dato disponible cuando falta puesto o área', async () => {
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    // Bo tiene puesto pero no área; Clara, área pero no puesto: se pinta solo
    // lo disponible, nunca un hueco, un separador huérfano ni "null".
    expect(screen.getAllByText('Tech Lead').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Datos').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/null|undefined/)
  })

  it('la identificación sale del snapshot: no consulta el empleado actual', async () => {
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    // La vista no puede mezclar tiempos: jamás pide datos actuales; el nombre
    // pintado es el capturado al generar (backend, RH-01.1).
    expect(listarEmpleados).not.toHaveBeenCalled()
    expect(screen.getAllByText('Ana Ruiz').length).toBeGreaterThan(0)
  })

  it('un snapshot previo a RH-01.1 sin nombre cae al ID como último recurso', async () => {
    vi.mocked(listarEvaluaciones).mockResolvedValue(
      pagina([
        evaluacion(30, '2025-Q4', 7, 4, {
          empleado_nombre: null,
          empleado_puesto: null,
          empleado_area: null,
        }),
      ]),
    )
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    expect(screen.getByText('Empleado 7')).toBeInTheDocument()
    // Sin puesto ni área históricos no se inventa la línea secundaria.
    expect(document.querySelectorAll('.evaluaciones-item__puesto')).toHaveLength(0)
  })
})

describe('Evaluaciones — 401 delega en alSesionExpirada (§31/§32)', () => {
  it('un 401 al leer el historial cierra la sesión', async () => {
    vi.mocked(listarEvaluaciones).mockRejectedValue(
      Object.assign(new Error('no autorizado'), { estado: 401 }),
    )
    const alSesionExpirada = vi.fn()
    render(<Evaluaciones token="token-rh" alSesionExpirada={alSesionExpirada} />)

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('No pudimos cargar las evaluaciones')).toBeNull()
  })

  it('un 401 al generar cierra la sesión', async () => {
    vi.mocked(generarEvaluaciones).mockRejectedValue(
      Object.assign(new Error('no autorizado'), { estado: 401 }),
    )
    const alSesionExpirada = vi.fn()
    render(<Evaluaciones token="token-rh" alSesionExpirada={alSesionExpirada} />)
    await esperarListado()

    abrirYConfirmar()

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('No pudimos generar las evaluaciones')).toBeNull()
  })
})

describe('Evaluaciones — evaluación histórica inmutable (§24)', () => {
  it('no ofrece editar, eliminar ni regenerar evaluaciones individuales', async () => {
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    expect(screen.queryByRole('button', { name: /Editar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Eliminar|Borrar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Actualizar|Guardar/i })).toBeNull()

    // Única acción permitida: generar el periodo vigente (crea snapshots
    // nuevos; no modifica los existentes).
    const botones = [...document.querySelectorAll('button')].map((b) =>
      b.textContent.trim(),
    )
    expect(botones).toContain('Generar evaluaciones del periodo vigente')
    expect(botones).toContain('Consultar')
  })
})

describe('Evaluaciones — lo que la vista NO calcula ni presenta', () => {
  it('no calcula ni deriva métricas de competencias o 9-Box en React', async () => {
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    // Términos inequívocamente derivados: la vista solo pinta el DTO.
    expect(document.body.textContent).not.toMatch(
      /promedio|delta|tendencia|puntuaci|score|ranking|\d+\s*%|↑|↓|media hist|acumulado/i,
    )
    expect(document.body.textContent).not.toMatch(/[▲▼]/)
    // Ni niveles inventados fuera del diccionario oficial (PRD §5).
    expect(document.body.textContent).not.toMatch(/Nivel 0/)
  })

  it('no usa gráficas ni elementos cuantitativos', async () => {
    const { container } = render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    expect(container.querySelector('canvas')).toBeNull()
    expect(container.querySelector('meter')).toBeNull()
    expect(container.querySelector('progress')).toBeNull()
    expect(container.querySelector('[role="img"]')).toBeNull()
  })

  it('no filtra por empleado_id ni envía parámetros fuera del contrato', async () => {
    render(<Evaluaciones token="token-rh" />)
    await esperarListado()

    // Los filtros de la vista son solo pagina/por_pagina/periodo (§31).
    expect(Object.keys(vi.mocked(listarEvaluaciones).mock.calls[0][1]).sort()).toEqual([
      'pagina',
      'periodo',
      'porPagina',
    ])
  })
})


