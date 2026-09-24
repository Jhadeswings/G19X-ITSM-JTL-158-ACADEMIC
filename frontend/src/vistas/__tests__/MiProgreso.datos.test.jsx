// Tests de "Mi progreso" — jerarquía, competencias y categorías del
// sistema (PRD §21.2, Style Guide §26). API mockeada: sin llamadas reales.

import { render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerProgreso } from '../../api/progreso.js'
import MiProgreso from '../MiProgreso.jsx'
import { crearRespuesta } from './ayuda.js'

vi.mock('../../api/progreso.js', () => ({
  obtenerProgreso: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(obtenerProgreso).mockReset()
})

describe('MiProgreso — jerarquía del Style Guide', () => {
  it('muestra las secciones en el orden exacto (§26)', async () => {
    vi.mocked(obtenerProgreso).mockResolvedValue(crearRespuesta())
    render(<MiProgreso token="t" />)

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Competencias' }),
      ).toBeInTheDocument(),
    )
    const titulos = screen
      .getAllByRole('heading', { level: 2 })
      .map((n) => n.textContent)
    expect(titulos).toEqual([
      '¿Cómo voy?',
      'Competencias',
      '¿Cómo se obtienen?',
      'Fortalezas',
      'Oportunidades de desarrollo',
      'Recomendación de desarrollo',
      'Transparencia de datos',
    ])
  })
})

describe('MiProgreso — competencias (dato del sistema)', () => {
  it('renderiza las cinco con nivel y etiqueta del backend', async () => {
    vi.mocked(obtenerProgreso).mockResolvedValue(crearRespuesta())
    render(<MiProgreso token="t" />)
    await waitFor(() =>
      screen.getByRole('heading', { name: 'Competencias' }),
    )

    expect(screen.getByText('5 · Alto')).toBeInTheDocument()
    expect(screen.getByText('4 · Consolidado')).toBeInTheDocument()
    expect(screen.getByText('3 · En crecimiento')).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(5)
  })

  it('preserva Datos insuficientes sin convertirlo en 0', async () => {
    vi.mocked(obtenerProgreso).mockResolvedValue(crearRespuesta())
    render(<MiProgreso token="t" />)
    await waitFor(() =>
      screen.getByRole('heading', { name: 'Competencias' }),
    )

    expect(screen.getAllByText('— · Datos insuficientes')).toHaveLength(2)
    expect(screen.queryByText('0 ·')).not.toBeInTheDocument()
  })

  it('muestra la evidencia recibida del backend tal cual', async () => {
    vi.mocked(obtenerProgreso).mockResolvedValue(crearRespuesta())
    render(<MiProgreso token="t" />)
    await waitFor(() =>
      screen.getByRole('heading', { name: 'Competencias' }),
    )
    expect(screen.getByText(/coordinó tareas: 3/)).toBeInTheDocument()
  })
})

describe('MiProgreso — fortalezas y oportunidades (solo backend)', () => {
  it('muestra exactamente las categorías que envía el backend', async () => {
    vi.mocked(obtenerProgreso).mockResolvedValue(crearRespuesta())
    render(<MiProgreso token="t" />)
    await waitFor(() =>
      screen.getByRole('heading', { name: 'Fortalezas' }),
    )

    const fortalezas = document.getElementById('fortalezas')
    expect(within(fortalezas).getByText('Liderazgo')).toBeInTheDocument()

    const oportunidades = document.getElementById('oportunidades')
    expect(
      within(oportunidades).getByText('Comunicación'),
    ).toBeInTheDocument()
  })

  it('NO deriva categorías de los niveles en frontend', async () => {
    // Backend envía listas VACÍAS aunque existan niveles 5 y 4: la vista
    // debe respetarlas (EstadoVacio), nunca derivar por su cuenta.
    vi.mocked(obtenerProgreso).mockResolvedValue(
      crearRespuesta({ fortalezas: [], oportunidades: [] }),
    )
    render(<MiProgreso token="t" />)
    await waitFor(() =>
      screen.getByRole('heading', { name: 'Fortalezas' }),
    )

    expect(screen.getByText('Aún no hay fortalezas calculadas')).toBeInTheDocument()
    expect(
      screen.getByText('Aún no hay oportunidades de desarrollo calculadas'),
    ).toBeInTheDocument()
    // El nivel 5 sigue visible en Competencias, pero NO listado como
    // fortaleza: prueba de que el frontend no calcula.
    expect(screen.getByText('5 · Alto')).toBeInTheDocument()
  })
})
