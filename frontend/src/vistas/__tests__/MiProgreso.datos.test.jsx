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

    expect(screen.getAllByText('— Datos insuficientes')).toHaveLength(2)
    expect(screen.queryByText('0 ·')).not.toBeInTheDocument()
  })

  it('muestra la evidencia recibida del backend en lista de datos', async () => {
    vi.mocked(obtenerProgreso).mockResolvedValue(crearRespuesta())
    render(<MiProgreso token="t" />)
    await waitFor(() =>
      screen.getByRole('heading', { name: 'Competencias' }),
    )
    const tarjeta = screen.getByRole('article', { name: /Liderazgo/ })
    expect(within(tarjeta).getByText('coordinó tareas')).toBeInTheDocument()
    expect(within(tarjeta).getAllByText('3')).toHaveLength(2)
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

describe('MiProgreso — recomendación IA (bloque secundario)', () => {
  it('con IA disponible muestra la sugerencia con procedencia explícita', async () => {
    vi.mocked(obtenerProgreso).mockResolvedValue(crearRespuesta())
    render(<MiProgreso token="t" />)
    await waitFor(() =>
      screen.getByRole('heading', { name: 'Competencias' }),
    )

    expect(
      screen.getByRole('complementary', {
        name: 'Recomendación de desarrollo generada por IA',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Generada con IA \(groq\)/)).toBeInTheDocument()
    expect(screen.queryByText('Recomendación no disponible')).not.toBeInTheDocument()
  })

  it('con IA no disponible muestra el estado controlado y conserva el resultado', async () => {
    // Contrato degradado del backend: engine OK + recomendacion_ia: null.
    vi.mocked(obtenerProgreso).mockResolvedValue(
      crearRespuesta({ recomendacion_ia: null }),
    )
    render(<MiProgreso token="t" />)
    await waitFor(() =>
      screen.getByRole('heading', { name: 'Competencias' }),
    )

    // El resultado oficial se muestra con normalidad (5 competencias).
    expect(screen.getAllByRole('article')).toHaveLength(5)
    expect(screen.getByText('5 · Alto')).toBeInTheDocument()

    // La sección sigue presente y el bloque IA muestra su estado controlado.
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Recomendación de desarrollo',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Recomendación no disponible')).toBeInTheDocument()
    expect(
      screen.getByRole('complementary', {
        name: 'Recomendación de desarrollo no disponible',
      }),
    ).toBeInTheDocument()

    // Sin procedencia inventada: nada de proveedor ni texto IA fabricado.
    expect(screen.queryByText(/Generada con IA/)).not.toBeInTheDocument()
    expect(screen.queryByText(/groq/)).not.toBeInTheDocument()

    // La vista NO cae en EstadoError por la ausencia de IA.
    expect(
      screen.queryByRole('heading', { name: 'No pudimos cargar tu progreso' }),
    ).not.toBeInTheDocument()
  })
})

describe('MiProgreso — errores reales de API (distintos de IA no disponible)', () => {
  it('un error 500 muestra EstadoError con reintento, sin datos inventados', async () => {
    vi.mocked(obtenerProgreso).mockRejectedValue(
      Object.assign(
        new Error('Ocurrió un problema inesperado. Inténtalo de nuevo más tarde.'),
        { estado: 500 },
      ),
    )
    render(<MiProgreso token="t" />)

    expect(
      await screen.findByRole('heading', {
        name: 'No pudimos cargar tu progreso',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Intentar de nuevo' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Competencias' })).not.toBeInTheDocument()
    expect(screen.queryByText('Recomendación no disponible')).not.toBeInTheDocument()
  })

  it('un 401 cierra la sesión en lugar de mostrar la vista', async () => {
    vi.mocked(obtenerProgreso).mockRejectedValue(
      Object.assign(new Error('Credenciales inválidas.'), { estado: 401 }),
    )
    const alSesionExpirada = vi.fn()
    render(<MiProgreso token="t" alSesionExpirada={alSesionExpirada} />)

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('heading', { name: 'Competencias' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'No pudimos cargar tu progreso' }),
    ).not.toBeInTheDocument()
  })
})
