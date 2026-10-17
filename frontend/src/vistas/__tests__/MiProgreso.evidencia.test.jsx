// Evidencia organizada de la tarjeta (Style Guide §15.1).
// Jerarquía: principal → secundario → excluido. Cubre los 10 puntos
// de verificación del bloque sin tocar negocio ni backend.

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CompetenciaCard from '../../componentes/CompetenciaCard.jsx'
import { obtenerProgreso } from '../../api/progreso.js'
import MiProgreso from '../MiProgreso.jsx'
import { CALC, crearRespuesta } from './ayuda.js'

const DI = 'INSUFFICIENT_DATA'

vi.mock('../../api/progreso.js', () => ({
  obtenerProgreso: vi.fn(),
}))

const POR_CLAVE = Object.fromEntries(
  crearRespuesta().resultado_actual.competencias.map((c) => [c.clave, c]),
)

function nombresEvidencia(tarjeta) {
  return within(tarjeta).getAllByRole('term').map((n) => n.textContent)
}

describe('CompetenciaCard — evidencia organizada', () => {
  it('no usa cadena `·` y expone lista de datos', () => {
    render(<CompetenciaCard competencia={POR_CLAVE.liderazgo} />)
    const tarjeta = screen.getByRole('article', { name: /Liderazgo/ })
    const evidencia = within(tarjeta).getByText('Evidencia').closest('div')
    expect(evidencia?.innerHTML).not.toContain('·')
    expect(within(tarjeta).getByText('coordinó tareas').tagName).toBe('DT')
  })
  it('ordena desempeño: principales antes que cancelados y excluidos', () => {
    render(
      <CompetenciaCard
        competencia={{
          clave: 'desempeno_tecnico',
          estado: CALC,
          nivel: 4,
          etiqueta: 'Consolidado',
          evidencia: {
            proyectos_en_proceso_excluidos: 2,
            proyectos_cancelados: 1,
            proyectos_evaluables: 5,
            proyectos_completados: 4,
          },
        }}
      />,
    )
    expect(nombresEvidencia(screen.getByRole('article', { name: /Desempeño/ }))).toEqual([
      'proyectos completados',
      'proyectos evaluables',
      'proyectos cancelados',
      'proyectos en proceso (excluidos)',
    ])
  })
  it('liderazgo muestra participaciones antes que coordinó tareas', () => {
    render(<CompetenciaCard competencia={POR_CLAVE.liderazgo} />)
    expect(nombresEvidencia(screen.getByRole('article', { name: /Liderazgo/ }))).toEqual([
      'participaciones',
      'coordinó tareas',
    ])
  })
  it('trabajo en equipo muestra participaciones antes que trabajó en equipo', () => {
    render(<CompetenciaCard competencia={POR_CLAVE.trabajo_equipo} />)
    expect(nombresEvidencia(screen.getByRole('article', { name: /Trabajo en equipo/ }))).toEqual([
      'participaciones',
      'trabajó en equipo',
    ])
  })
  it('comunicación muestra participaciones antes que explicó a públicos distintos', () => {
    render(
      <CompetenciaCard
        competencia={{
          clave: 'comunicacion',
          estado: CALC,
          nivel: 3,
          etiqueta: 'En crecimiento',
          evidencia: { explico_a_publico_distinto_true: 2, participaciones: 3 },
        }}
      />,
    )
    expect(nombresEvidencia(screen.getByRole('article', { name: /Comunicación/ }))).toEqual([
      'participaciones',
      'explicó a públicos distintos',
    ])
  })
  it('aprendizaje muestra evidencia principal antes que requisitos de referencia', () => {
    render(
      <CompetenciaCard
        competencia={{
          clave: 'aprendizaje',
          estado: DI,
          nivel: null,
          etiqueta: null,
          evidencia: {
            minimo_proyectos_unicos: 3,
            minimo_capacitaciones: 2,
            capacitaciones_registradas: 1,
            proyectos_unicos: 2,
            roles_distintos: 1,
          },
        }}
      />,
    )
    const tarjeta = screen.getByRole('article', { name: /aprendizaje/i })
    expect(nombresEvidencia(tarjeta)).toEqual([
      'roles distintos',
      'proyectos únicos',
      'capacitaciones registradas',
      'mínimo de capacitaciones requeridas',
      'mínimo de proyectos únicos requeridos',
    ])
    const referencia = screen.getByText('mínimo de capacitaciones requeridas').closest('div')
    expect(referencia?.className).toContain('competencia__dato--secundario')
    expect(referencia?.className).toContain('competencia__dato--inicio-grupo')
  })
  it('los ceros siguen siendo ceros y no parecen error', () => {
    render(
      <CompetenciaCard
        competencia={{
          clave: 'liderazgo',
          estado: CALC,
          nivel: 1,
          etiqueta: 'Inicial',
          evidencia: { participaciones: 0, coordino_tareas_true: 0 },
        }}
      />,
    )
    const tarjeta = screen.getByRole('article', { name: /Liderazgo/ })
    expect(within(tarjeta).getAllByText('0')).toHaveLength(2)
    expect(within(tarjeta).queryByText('—')).not.toBeInTheDocument()
    expect(within(tarjeta).queryByText('— Datos insuficientes')).not.toBeInTheDocument()
    expect(within(tarjeta).queryByText(/sin datos/i)).not.toBeInTheDocument()
  })
  it('no depende del orden del objeto del backend', () => {
    const base = { clave: 'liderazgo', estado: CALC, nivel: 5, etiqueta: 'Alto' }
    const { rerender } = render(
      <CompetenciaCard competencia={{ ...base, evidencia: { participaciones: 3, coordino_tareas_true: 3 } }} />,
    )
    const primero = nombresEvidencia(screen.getByRole('article', { name: /Liderazgo/ }))
    rerender(
      <CompetenciaCard competencia={{ ...base, evidencia: { coordino_tareas_true: 3, participaciones: 3 } }} />,
    )
    expect(nombresEvidencia(screen.getByRole('article', { name: /Liderazgo/ }))).toEqual(primero)
    expect(primero).toEqual(['participaciones', 'coordinó tareas'])
  })
  it('subordina el dato excluido', () => {
    render(
      <CompetenciaCard
        competencia={{
          clave: 'desempeno_tecnico',
          estado: CALC,
          nivel: 4,
          etiqueta: 'Consolidado',
          evidencia: {
            proyectos_completados: 4,
            proyectos_evaluables: 5,
            proyectos_cancelados: 1,
            proyectos_en_proceso_excluidos: 2,
          },
        }}
      />,
    )
    const fila = screen.getByText('proyectos en proceso (excluidos)').closest('div')
    expect(fila?.className).toContain('competencia__dato--excluido')
  })
  it('cada dato separa etiqueta y valor destacados sin concatenar', () => {
    render(<CompetenciaCard competencia={POR_CLAVE.liderazgo} />)
    const tarjeta = screen.getByRole('article', { name: /Liderazgo/ })
    const filas = within(tarjeta).getAllByRole('term').map((n) => n.closest('div'))
    expect(filas).toHaveLength(2)
    for (const fila of filas) {
      expect(fila?.querySelector('dt')).not.toBeNull()
      expect(fila?.querySelector('dd')).not.toBeNull()
      expect(fila?.querySelector('dt')?.textContent).not.toContain('0')
    }
  })
  it('DI conserva estado válido sin convertirlo a 0', () => {
    render(<CompetenciaCard competencia={POR_CLAVE.comunicacion} />)
    expect(screen.getByText('— Datos insuficientes')).toBeInTheDocument()
    expect(screen.queryByText('0 ·')).not.toBeInTheDocument()
    expect(screen.getByText('participaciones')).toBeInTheDocument()
  })
  it('el círculo numera la fila (1–5) y DI conserva su número sin nivel', () => {
    for (const indice of [1, 2, 3, 4, 5]) {
      const { unmount } = render(
        <CompetenciaCard
          indice={indice}
          competencia={{
            clave: 'liderazgo',
            estado: CALC,
            nivel: 4,
            etiqueta: 'Consolidado',
            evidencia: { participaciones: 3, coordino_tareas_true: 0 },
          }}
        />,
      )
      const tarjeta = screen.getByRole('article', { name: /Liderazgo/ })
      // El círculo es la POSICIÓN, no el nivel: sin ceros ni guiones.
      expect(tarjeta.querySelector('.competencia__index')?.textContent).toBe(
        String(indice),
      )
      // El nivel oficial viaja aparte y los ceros de la Evidencia siguen
      // siendo 0 sin generar `0—`.
      expect(tarjeta.querySelector('.acordeon__nu')?.textContent).toBe('4')
      expect(within(tarjeta).getAllByRole('definition').map((n) => n.textContent)).toContain('0')
      expect(tarjeta.textContent).not.toContain('0—')
      unmount()
    }
    render(<CompetenciaCard indice={4} competencia={POR_CLAVE.comunicacion} />)
    const tarjeta = screen.getByRole('article', { name: /Comunicación/ })
    // DI conserva el número de su fila y no muestra nivel alguno.
    expect(tarjeta.querySelector('.competencia__index')?.textContent).toBe('4')
    expect(tarjeta.querySelector('.acordeon__nu')?.textContent).toBe('')
    expect(tarjeta.textContent).not.toContain('0—')
    expect(screen.getByText('— Datos insuficientes')).toBeInTheDocument()
  })
  it('no muestra valor, score ni componentes sin etiqueta', () => {
    render(
      <CompetenciaCard
        competencia={{
          clave: 'aprendizaje',
          estado: CALC,
          nivel: 3,
          etiqueta: 'En crecimiento',
          valor: '3.40',
          evidencia: {
            roles_distintos: 2,
            proyectos_unicos: 3,
            capacitaciones_registradas: 2,
            anio_calendario: 2026,
            cursos_completados_anio: 1,
            componente_a_roles: 3,
            componente_b_cursos: 1,
            score: '2.20',
          },
        }}
      />,
    )
    const tarjeta = screen.getByRole('article', { name: /aprendizaje/i })
    expect(tarjeta.textContent).not.toMatch(/score/i)
    expect(tarjeta.textContent).not.toMatch(/anio/i)
    expect(tarjeta.textContent).not.toMatch(/componente/i)
    expect(within(tarjeta).getByText('cursos completados este año')).toBeInTheDocument()
  })
  it('mantiene acceso a la sección global ¿Cómo se obtienen?', async () => {
    vi.mocked(obtenerProgreso).mockResolvedValue(crearRespuesta())
    render(<MiProgreso token="t" />)
    const enlaces = await screen.findAllByRole('link', { name: /¿Cómo se obtiene\?/ })
    expect(enlaces).toHaveLength(5)
    for (const enlace of enlaces) {
      expect(enlace.getAttribute('href')).toBe('#como-se-obtienen')
    }
    expect(await screen.findByRole('heading', { name: '¿Cómo se obtienen?' })).toBeInTheDocument()
  })
  it('las cinco competencias conservan nombre, nivel y evidencia', async () => {
    vi.mocked(obtenerProgreso).mockResolvedValue(crearRespuesta())
    render(<MiProgreso token="t" />)
    await screen.findByRole('heading', { name: 'Competencias' })
    expect(screen.getAllByRole('article')).toHaveLength(5)
    expect(screen.getAllByRole('term').length).toBeGreaterThan(5)
  })
})
