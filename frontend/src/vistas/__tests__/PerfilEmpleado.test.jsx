// Perfil individual RH: información básica + última evaluación (PRD §20.2;
// Style Guide §6, §7). La API se mockea: sin llamadas reales al backend.
//
// Qué se verifica aquí:
// - estado de carga de ambas consultas;
// - información básica del EmpleadoOut, sin resultados ni competencias actuales;
// - última evaluación histórica: periodo, fecha, competencias snapshot,
//   9-Box histórico, DI neutral, sin generado_por_cuenta_id;
// - estados vacío/error/401 propios de la evaluación, sin romper la básica;
// - apertura desde una fila sin recargar el catálogo;
// - volver al listado sin consultas extra.

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listarEmpleados, obtenerEmpleado, POR_PAGINA_DEFECTO } from '../../api/empleados.js'
import { listarEvaluacionesEmpleado } from '../../api/evaluaciones.js'
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

vi.mock('../../api/evaluaciones.js', () => ({
  listarEvaluacionesEmpleado: vi.fn(),
}))

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

beforeEach(() => {
  vi.mocked(listarEmpleados).mockReset()
  vi.mocked(obtenerEmpleado).mockReset()
  vi.mocked(listarEvaluacionesEmpleado).mockReset()
  vi.mocked(listarEmpleados).mockResolvedValue(pagina(EMPLEADOS))
  vi.mocked(obtenerEmpleado).mockResolvedValue(DETALLE)
  vi.mocked(listarEvaluacionesEmpleado).mockResolvedValue(paginaEvaluacion())
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
    vi.mocked(listarEvaluacionesEmpleado).mockReturnValue(new Promise(() => {}))

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    // La sección se monta con la información básica ya resuelta; la consulta
    // de evaluaciones sigue pendiente con su propio estado de carga.
    expect(await screen.findByText('Última evaluación')).toBeInTheDocument()
    expect(screen.getByText('Cargando última evaluación…')).toBeInTheDocument()
  })

  it('consulta el historial con pagina=1 y porPagina=1 una sola vez', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await screen.findByText('2026-Q3')

    expect(listarEvaluacionesEmpleado).toHaveBeenCalledTimes(1)
    expect(vi.mocked(listarEvaluacionesEmpleado).mock.calls[0]).toEqual([
      'token-rh',
      1,
      { pagina: 1, porPagina: 1 },
    ])
  })

  it('muestra periodo, fecha de generación y cinco competencias históricas', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(await screen.findByText('2026-Q3')).toBeInTheDocument()
    expect(screen.getByText('20 de septiembre de 2026')).toBeInTheDocument()
    expect(screen.queryByText('2026-09-20')).not.toBeInTheDocument()

    const nombres = [
      'Desempeño técnico',
      'Liderazgo',
      'Trabajo en equipo',
      'Comunicación',
      'Capacidad de aprendizaje',
    ]
    for (const nombre of nombres) {
      expect(screen.getByText(nombre)).toBeInTheDocument()
    }
    expect(screen.getByText('Nivel 3')).toBeInTheDocument()
    expect(screen.getByText('Nivel 5')).toBeInTheDocument()
  })

  it('muestra Datos insuficientes sin convertir DI en 0', async () => {
    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    await screen.findByText('2026-Q3')

    expect(screen.getByText('— Datos insuficientes')).toBeInTheDocument()
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
    vi.mocked(listarEvaluacionesEmpleado).mockResolvedValue(
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

    expect(screen.getByText('Datos insuficientes.')).toBeInTheDocument()
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
    vi.mocked(listarEvaluacionesEmpleado).mockResolvedValue(paginaEvaluacion([]))

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(
      await screen.findByText(
        'Todavía no hay evaluaciones oficiales para este empleado.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Información básica')).toBeInTheDocument()
    // El único "Volver al listado" es el superior: el inferior de la tarjeta
    // de Última evaluación se eliminó (la navegación superior basta).
    expect(
      screen.getAllByRole('button', { name: 'Volver al listado' }),
    ).toHaveLength(1)
  })

  it('muestra error y permite reintentar sin destruir la información básica', async () => {
    vi.mocked(listarEvaluacionesEmpleado).mockRejectedValueOnce(
      Object.assign(new Error('fallo del servidor'), { estado: 500 }),
    )

    render(
      <PerfilEmpleado token="token-rh" empleadoId={1} alVolver={() => {}} />,
    )

    expect(
      await screen.findByText('No pudimos cargar la última evaluación'),
    ).toBeInTheDocument()
    expect(screen.getByText('Información básica')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    expect(await screen.findByText('2026-Q3')).toBeInTheDocument()
    expect(listarEvaluacionesEmpleado).toHaveBeenCalledTimes(2)
  })

  it('cierra la sesión ante un 401 sin mostrar un estado de error', async () => {
    const alSesionExpirada = vi.fn()
    vi.mocked(listarEvaluacionesEmpleado).mockRejectedValue(
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
