// Tests de estructura y navegación de "Inicio" (PRD §21.1, MB-7-2).
//
// Esta etapa es SOLO composición: la vista monta el orden de bloques que pide
// el PRD, presenta lo que devuelve el backend y no calcula nada. Los tests
// cubren la estructura, los límites de contrato (nada de métricas nuevas,
// nada de "Próximo paso" implementado) y los estados de carga/error.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerResultadoActual } from '../../api/resultado.js'
import Inicio from '../Inicio.jsx'

vi.mock('../../api/resultado.js', () => ({ obtenerResultadoActual: vi.fn() }))

const DI = 'INSUFFICIENT_DATA'
const CALC = 'CALCULABLE'

/** Payload fiel al ResultadoActualDTO real de GET /api/v1/me/result. */
function resultado({
  competencias = [
    {
      clave: 'desempeno_tecnico',
      estado: CALC,
      nivel: 4,
      valor: '80.00',
      evidencia: { proyectos_completados: 4, proyectos_evaluables: 5 },
      etiqueta: 'Consolidado',
    },
    {
      clave: 'liderazgo',
      estado: DI,
      nivel: null,
      valor: null,
      evidencia: { participaciones: 2 },
      etiqueta: null,
    },
  ],
  fortalezas = ['desempeno_tecnico'],
} = {}) {
  return {
    empleado_id: 7,
    competencias,
    experiencia: {
      fecha_ingreso: '2020-01-01',
      anios_antiguedad: '6.00',
      proyectos_unicos: 5,
    },
    fortalezas,
    oportunidades: ['liderazgo'],
  }
}

const CINCO = [
  ['desempeno_tecnico', CALC, 4, '80.00', { proyectos_completados: 4 }, 'Consolidado'],
  ['liderazgo', DI, null, null, { participaciones: 2 }, null],
  ['trabajo_equipo', DI, null, null, { participaciones: 1 }, null],
  ['comunicacion', DI, null, null, { participaciones: 1 }, null],
  ['aprendizaje', DI, null, null, { capacitaciones_registradas: 1 }, null],
].map(([clave, estado, nivel, valor, evidencia, etiqueta]) => ({
  clave,
  estado,
  nivel,
  valor,
  evidencia,
  etiqueta,
}))

function montarResultado(respuesta = resultado()) {
  vi.mocked(obtenerResultadoActual).mockResolvedValue(respuesta)
  return render(
    <Inicio
      token="token-empleado"
      alSesionExpirada={vi.fn()}
      onIrAProgreso={vi.fn()}
      onIrAProyectos={vi.fn()}
    />,
  )
}

beforeEach(() => {
  vi.mocked(obtenerResultadoActual).mockReset()
})
describe('Inicio — estructura de la vista (PRD §21.1)', () => {
  it('muestra el encabezado de sección y consulta el resultado propio', async () => {
    montarResultado()

    expect(
      await screen.findByRole('heading', { name: 'Inicio', level: 1 }),
    ).toBeInTheDocument()
    expect(obtenerResultadoActual).toHaveBeenCalledWith('token-empleado')
  })

  it('presenta los bloques en el orden del PRD', async () => {
    const { container } = montarResultado()
    await screen.findByRole('heading', { name: 'Inicio', level: 1 })

    const titulos = [...container.querySelectorAll('.inicio-bloque > h2')].map(
      (nodo) => nodo.textContent.trim(),
    )
    expect(titulos).toEqual([
      'Progreso',
      'Proyectos',
      'Resumen de competencias',
      'Próximo paso',
      'Recomendación de desarrollo',
    ])
  })

  it('el bloque de recomendación IA queda separado y sin contenido de proveedor', async () => {
    montarResultado()
    await screen.findByRole('heading', { name: 'Inicio', level: 1 })

    const bloque = screen
      .getByRole('heading', { name: 'Recomendación de desarrollo', level: 2 })
      .closest('section')
    // Estado controlado de AIRecommendation: Inicio no pide sugerencia a la IA.
    expect(within(bloque).getByText('Recomendación no disponible')).toBeInTheDocument()
  })

  it('el bloque de proyectos orienta hacia su propia sección sin inventar datos', async () => {
    const onIrAProyectos = vi.fn()
    vi.mocked(obtenerResultadoActual).mockResolvedValue(resultado())
    render(
      <Inicio token="token-empleado" alSesionExpirada={vi.fn()} onIrAProyectos={onIrAProyectos} />,
    )
    await screen.findByRole('heading', { name: 'Inicio', level: 1 })

    expect(screen.getByText('Tus proyectos viven en «Mis proyectos»')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Ir a Mis proyectos/ }))
    expect(onIrAProyectos).toHaveBeenCalled()
  })
})

describe('Inicio — sin lógica de negocio en el frontend', () => {
  it('presenta las cinco competencias sin convertir DI en cero', async () => {
    montarResultado(resultado({ competencias: CINCO }))
    await screen.findByRole('heading', { name: 'Inicio', level: 1 })

    const resumen = screen
      .getByRole('heading', { name: 'Resumen de competencias', level: 2 })
      .closest('section')
    // Cinco tarjetas: la experiencia NO es una sexta competencia.
    expect(within(resumen).getAllByRole('article')).toHaveLength(5)
    // Las cuatro DI se muestran como "Datos insuficientes", jamás como nivel 0.
    expect(within(resumen).getAllByText('— Datos insuficientes')).toHaveLength(4)
    expect(within(resumen).queryByText(/^0 ·/)).not.toBeInTheDocument()
  })

  it('solo lista las competencias que el backend marcó CALCULABLE', async () => {
    montarResultado()
    await screen.findByRole('heading', { name: 'Inicio', level: 1 })

    const tarjeta = screen.getByText('Competencias con evidencia').closest('article')
    expect(within(tarjeta).getByText('Desempeño técnico')).toBeInTheDocument()
    expect(within(tarjeta).queryByText('Liderazgo')).not.toBeInTheDocument()
  })

  it('presenta la experiencia como contexto, no como competencia', async () => {
    montarResultado()
    await screen.findByRole('heading', { name: 'Inicio', level: 1 })

    const tarjeta = screen.getByText('Experiencia').closest('article')
    expect(within(tarjeta).getByText(/Proyectos únicos registrados: 5/)).toBeInTheDocument()
    expect(
      within(tarjeta).getByText(/no es una competencia y no modifica tus niveles/),
    ).toBeInTheDocument()
  })

  it('no inventa métricas: sin score, ranking, 9-Box ni porcentajes', async () => {
    const { container } = montarResultado()
    await screen.findByRole('heading', { name: 'Inicio', level: 1 })

    const texto = container.textContent.toLowerCase()
    for (const prohibido of ['9-box', 'nine', 'ranking', 'score', 'promedio', '%']) {
      expect(texto).not.toContain(prohibido)
    }
  })

  it('deja "Próximo paso" como espacio reservado, sin contenido implementado', async () => {
    montarResultado()
    await screen.findByRole('heading', { name: 'Inicio', level: 1 })

    const bloque = screen.getByRole('heading', { name: 'Próximo paso', level: 2 }).closest('section')
    expect(within(bloque).getByText('Este espacio está reservado')).toBeInTheDocument()
  })
})

describe('Inicio — estados de la vista (Style Guide §13)', () => {
  it('muestra carga mientras consulta', async () => {
    let resolver
    vi.mocked(obtenerResultadoActual).mockReturnValue(
      new Promise((r) => {
        resolver = r
      }),
    )
    render(<Inicio token="token-empleado" alSesionExpirada={vi.fn()} />)

    expect(await screen.findByText('Cargando tu inicio…')).toBeInTheDocument()
    resolver(resultado())
    expect(await screen.findByRole('heading', { name: 'Inicio', level: 1 })).toBeInTheDocument()
  })

  it('muestra error con reintento si la consulta falla', async () => {
    vi.mocked(obtenerResultadoActual).mockRejectedValue(
      Object.assign(new Error('Fallo'), { estado: 500 }),
    )
    render(<Inicio token="token-empleado" alSesionExpirada={vi.fn()} />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('No pudimos cargar tu inicio')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Intentar de nuevo' })).toBeInTheDocument()
  })

  it('un 401 del backend cierra la sesión en vez de mostrar un error', async () => {
    const alSesionExpirada = vi.fn()
    vi.mocked(obtenerResultadoActual).mockRejectedValue(
      Object.assign(new Error('Sesión expirada'), { estado: 401 }),
    )
    render(<Inicio token="token-empleado" alSesionExpirada={alSesionExpirada} />)

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalled())
    // El shell toma el relevo: Inicio no pinta un error al usuario.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})